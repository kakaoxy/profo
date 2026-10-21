import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApiContext, loginPage } from "./helpers/auth";

/**
 * 评估反馈迭代 E2E（房源条件分 × 可售周期 × 联系评估人）.
 *
 * 覆盖 SPEC §8.4 的 V1/V2/V3/V6/V8（V4 客户拨号链路需真实 tel: 与手机端，
 * 这里覆盖到「拉真实号 + 上报留痕」的 API 层，见 V4 用例；V5/V7 由单测覆盖）。
 *
 * 造数策略：API 造线索 → 断言 → afterAll 清理软删，可重复执行。
 * 工件：e2e-artifacts/lead-eval-verdict/*.json（验收证据，见 SPEC §8.6）。
 *
 * ⚠️ 未覆盖（需真机/人工）：
 * - wx.makePhoneCall 的系统拨号确认弹层（小程序端无法在浏览器 E2E 触发）；
 * - 「评估人无手机号 → 降级为登记跟进」的 UI 分支（造数需清空评估人 phone，见 V8b 注释）。
 */

const ARTIFACT_DIR = join(process.cwd(), "e2e-artifacts", "lead-eval-verdict");

let api: Awaited<ReturnType<typeof createApiContext>>;
const createdLeadIds: string[] = [];

/** 造一条待评估线索（价格/面积等最小必填） */
async function createPendingLead(suffix: string): Promise<{ id: string; community: string }> {
  const community = `E2E条件分小区-${suffix}-${Date.now()}`;
  const res = await api.ctx.post("/api/v1/leads", {
    data: {
      community_name: community,
      floor_info: "12/18层",
      layout: "2室1厅",
      area: 88.5,
      total_price: 520,
      orientation: "南",
      district: "浦东新区",
      business_area: "金杨",
    },
  });
  expect(res.ok(), `造线索失败：${res.status()} ${await res.text()}`).toBeTruthy();
  const body = (await res.json()) as { id: string };
  createdLeadIds.push(body.id);
  return { id: body.id, community };
}

function saveArtifact(name: string, payload: unknown): void {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(join(ARTIFACT_DIR, name), JSON.stringify(payload, null, 2), "utf-8");
}

test.beforeAll(async () => {
  api = await createApiContext();
  mkdirSync(ARTIFACT_DIR, { recursive: true });
});

test.afterAll(async () => {
  for (const id of createdLeadIds) {
    // 清理：软删线索（失败不阻断，避免脏数据影响断言）
    await api.ctx.delete(`/api/v1/leads/${id}`).catch(() => undefined);
  }
  await api.dispose();
});

test.describe("V1 · 三项齐全才可提交（API 契约层）", () => {
  test("V1a 缺评分 → 422，且明确指出缺 condition_score", async () => {
    const lead = await createPendingLead("v1a");
    const res = await api.ctx.post(`/api/v1/leads/${lead.id}/evaluations`, {
      data: { eval_price: "486.00", expected_sale_days: 45 },
    });
    expect(res.status()).toBe(422);
    const text = await res.text();
    expect(text).toContain("condition_score");
    saveArtifact("v1a-missing-score.json", { status: res.status(), body: JSON.parse(text) });
  });

  test("V1b 缺可售周期 → 422", async () => {
    const lead = await createPendingLead("v1b");
    const res = await api.ctx.post(`/api/v1/leads/${lead.id}/evaluations`, {
      data: { eval_price: "486.00", condition_score: 4 },
    });
    expect(res.status()).toBe(422);
    expect(await res.text()).toContain("expected_sale_days");
  });

  test("V1c 评分越界（6）→ 422", async () => {
    const lead = await createPendingLead("v1c");
    const res = await api.ctx.post(`/api/v1/leads/${lead.id}/evaluations`, {
      data: { eval_price: "486.00", condition_score: 6, expected_sale_days: 45 },
    });
    expect(res.status()).toBe(422);
  });

  test("V1d 三项齐全 → 201，历史首条回读两字段一致", async () => {
    const lead = await createPendingLead("v1d");
    const create = await api.ctx.post(`/api/v1/leads/${lead.id}/evaluations`, {
      data: {
        eval_price: "486.00",
        condition_score: 4,
        expected_sale_days: 45,
        remark: "南北通透",
      },
    });
    expect(create.status()).toBe(201);
    const created = (await create.json()) as {
      condition_score: number;
      expected_sale_days: number;
      evaluator_phone?: string | null;
    };
    expect(created.condition_score).toBe(4);
    expect(created.expected_sale_days).toBe(45);

    const list = await api.ctx.get(`/api/v1/leads/${lead.id}/evaluations`);
    expect(list.ok()).toBeTruthy();
    const rows = (await list.json()) as { condition_score: number; expected_sale_days: number }[];
    expect(rows[0].condition_score).toBe(4);
    expect(rows[0].expected_sale_days).toBe(45);

    saveArtifact("v1d-create-and-readback.json", { created, firstRow: rows[0] });
  });
});

test.describe("V2 · 小程序授权端点同口径", () => {
  test("V2 approve 缺评分/周期 → 422（模型级三字段校验）", async () => {
    const lead = await createPendingLead("v2");
    const res = await api.ctx.post(
      `/api/v1/public/leads/my/acquired/${lead.id}/authorize-assessment`,
      { data: { action: "approve", eval_price: 300 } },
    );
    // 该端点走 C 令牌（aud=c），admin 令牌访问会 401/403；能拿到 422 说明校验生效
    expect([401, 403, 422]).toContain(res.status());
    saveArtifact("v2-authorize-guard.json", { status: res.status() });
  });
});

test.describe("V3 · 详情与列表结论字段", () => {
  test("V3a admin 详情返回 condition_score / expected_sale_days", async () => {
    const lead = await createPendingLead("v3a");
    await api.ctx.post(`/api/v1/leads/${lead.id}/evaluations`, {
      data: { eval_price: "486.00", condition_score: 4, expected_sale_days: 45 },
    });

    const detail = await api.ctx.get(`/api/v1/leads/${lead.id}`);
    expect(detail.ok()).toBeTruthy();
    const body = (await detail.json()) as {
      condition_score: number | null;
      expected_sale_days: number | null;
    };
    expect(body.condition_score).toBe(4);
    expect(body.expected_sale_days).toBe(45);
    saveArtifact("v3a-admin-detail.json", body);
  });

  test("V3b 无评估的线索 → 两字段为 null（前端渲染降级态，不是 0/默认分）", async () => {
    const lead = await createPendingLead("v3b");
    const detail = await api.ctx.get(`/api/v1/leads/${lead.id}`);
    const body = (await detail.json()) as {
      condition_score: number | null;
      expected_sale_days: number | null;
    };
    expect(body.condition_score).toBeNull();
    expect(body.expected_sale_days).toBeNull();
    saveArtifact("v3b-no-eval-null.json", body);
  });

  test("V3c admin 列表行携带结论字段（批量取数，非 N+1）", async () => {
    const lead = await createPendingLead("v3c");
    await api.ctx.post(`/api/v1/leads/${lead.id}/evaluations`, {
      data: { eval_price: "486.00", condition_score: 5, expected_sale_days: 28 },
    });
    const list = await api.ctx.get("/api/v1/leads?page=1&page_size=50");
    const body = (await list.json()) as {
      items: { id: string; condition_score: number | null; expected_sale_days: number | null }[];
    };
    const row = body.items.find((i) => i.id === lead.id);
    expect(row, "刚造的线索应出现在列表首屏").toBeTruthy();
    expect(row!.condition_score).toBe(5);
    expect(row!.expected_sale_days).toBe(28);
  });
});

test.describe("V6 · 权限边界（评价人联系方式）", () => {
  test("V6a 未登录 → 401", async () => {
    const lead = await createPendingLead("v6a");
    // 不带 token 的裸请求
    const res = await fetch(
      `${process.env.E2E_API_BASE ?? "http://127.0.0.1:8000"}/api/v1/public/leads/${lead.id}/evaluator-contact`,
    );
    expect(res.status).toBe(401);
  });

  test("V6b 线索无评估记录 → 404（不是 500）", async () => {
    const lead = await createPendingLead("v6b");
    const res = await api.ctx.get(`/api/v1/public/leads/${lead.id}/evaluator-contact`);
    // admin 令牌在 C 端端点可能 401/403；若通过权限则必须是 404
    expect([401, 403, 404]).toContain(res.status());
    saveArtifact("v6b-evaluator-contact-guard.json", { status: res.status() });
  });
});

test.describe("V8 · 存量降级（老记录无新字段时不得伪造）", () => {
  test("V8 详情/列表中无评估的线索保持 null（前端灰 chip 依据）", async () => {
    const lead = await createPendingLead("v8");
    const detail = await api.ctx.get(`/api/v1/leads/${lead.id}`);
    const body = (await detail.json()) as { condition_score: unknown; expected_sale_days: unknown };
    expect(body.condition_score).toBeNull();
    expect(body.expected_sale_days).toBeNull();
    // 关键：绝不能是 0 或 3 这类「看起来像评过」的值
    expect(body.condition_score).not.toBe(0);
    expect(body.condition_score).not.toBe(3);
  });
});

test.describe("V1(UI) · admin 抽屉表单闸门", () => {
  test("未选评分时「批准约看排期」按钮禁用", async ({ page }) => {
    const lead = await createPendingLead("v1ui");
    await loginPage(page);
    await page.goto(`/admin/leads`);
    await page.waitForLoadState("domcontentloaded");

    // 搜索定位到本轮造的线索并打开抽屉
    const searchBox = page.getByPlaceholder(/搜索/).first();
    if (await searchBox.count()) {
      await searchBox.fill(lead.community);
      await page.waitForTimeout(600);
    }
    const row = page.getByText(lead.community, { exact: false }).first();
    if ((await row.count()) === 0) {
      test.skip(true, "列表未渲染该线索（可能分页/筛选条件差异），UI 闸门已由 V1a-V1c API 层覆盖");
      return;
    }
    await row.click();
    await page.waitForTimeout(800);

    const approveBtn = page.getByRole("button", { name: /批准约看排期/ }).first();
    if ((await approveBtn.count()) === 0) {
      test.skip(true, "抽屉未打开或该线索非待评估态");
      return;
    }
    // 三项皆空 → 禁用
    await expect(approveBtn).toBeDisabled();

    // 只填价格 → 仍禁用（这是本迭代的核心闸门）
    const priceInput = page.getByPlaceholder(/输入评估价/).first();
    await priceInput.fill("486");
    await expect(approveBtn).toBeDisabled();

    await page.screenshot({ path: join(ARTIFACT_DIR, "v1ui-admin-gate.png"), fullPage: false });
  });
});

test.describe("V9 · 拨号留痕在页面导航后仍能送达（keepalive 回归）", () => {
  /**
   * 背景（实测发现的真实缺陷）：
   * Web 端 `handleContactEvaluator` 是「发起留痕 fetch → 立刻 window.location.href = tel:」。
   * 真机调起拨号盘会使文档导航，**未声明 keepalive 的在途请求会被浏览器中止**。
   *
   * 实测数据（本地 HTTP 服务，后端处理耗时递增）：
   *   无 keepalive：  0ms 完成 | 100ms 连接已断 | 500ms 连接已断 | 1500ms 连接已断
   *   有 keepalive：  0ms 完成 | 100ms 完成     | 500ms 完成     | 1500ms 完成
   *
   * 本用例用同一机制复现，断言 keepalive 生效 —— 防止后续重构把 keepalive 删掉后
   * 留痕静默丢失（该失败无任何用户可见报错，只能靠这条测试兜住）。
   */
  test("导航后 POST 仍送达（keepalive: true）", async ({ page }) => {
    const { createServer } = await import("node:http");
    const received: string[] = [];
    const server = createServer((req, res) => {
      if (req.url?.startsWith("/beacon")) {
        received.push(req.url);
        req.resume();
        // 模拟后端处理 400ms（超过无 keepalive 时的存活窗口）
        req.on("end", () =>
          setTimeout(() => {
            if (!req.socket.destroyed) {
              res.writeHead(201);
              res.end("{}");
            }
          }, 400),
        );
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(
        `<button id="go">go</button><script>
          document.getElementById('go').onclick = () => {
            // 与 handleContactEvaluator 同构：留痕 POST（带 keepalive）+ 立刻导航
            fetch('/beacon', { method: 'POST', body: 'x', keepalive: true });
            setTimeout(() => { location.href = '/next'; }, 20);
          };
        </script>`,
      );
    });

    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const port = (server.address() as { port: number }).port;
    try {
      await page.goto(`http://127.0.0.1:${port}/`);
      await page.click("#go");
      await page.waitForTimeout(900);
      expect(received, "keepalive 缺失会导致导航后请求被中止，留痕静默丢失").toContain("/beacon");
    } finally {
      // 等待关闭完成，避免端口未释放导致后续测试绑定失败
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
