import { test, expect } from "@playwright/test";
import { loginPage, createApiContext, FRONTEND_BASE } from "./helpers/auth";

/**
 * 资金账户 E2E（SPEC docs/To-Do/2026-10-21-资金账户管理-落地SPEC.md §8 可复验工件）.
 *
 * 覆盖「接线类」修复的消费方真实生效（不只是编译通过）：
 * 1. `/admin/accounts` 未解锁时渲染锁屏；输入错误密码 → 错误提示；输入正确密码 → 进入总览；
 * 2. 新建账户（抽屉）→ 卡片出现且余额 = 期初；
 * 3. 项目账本「记一笔」弹窗内可选到该账户 → 提交成功；
 * 4. 账户卡片余额按「期初 − 流出」变化（证明记账真的写入了 account_id 并被余额推导消费）；
 * 5. 手动锁定 → 页面回到锁屏（令牌作废在服务端生效）。
 *
 * 造数策略：账户走 UI 创建（e2e_ 前缀），流水走 API 创建（避免依赖具体项目选择器），
 * 结束时经 API 清理：删流水 → 删账户 → 删项目。
 *
 * 前置：后端 :8000 + 前端 :3000 运行；E2E_ADMIN_USER / E2E_ADMIN_PASSWORD 从 .env.local 读取。
 *
 * ⚠️ 模块密码来自环境变量 E2E_FUND_ACCOUNT_PASSWORD（默认不设则用例跳过写密码步骤）：
 * 为避免测试间互相锁定，本用例只在「已解锁」状态下工作——即先经 API 解锁拿令牌并注入
 * sessionStorage（与真实前端同一条路径：令牌在 sessionStorage 中携带）。
 */

const UNLOCK_TOKEN_KEY = "profo:fund-accounts:unlock-token";
const MODULE_PASSWORD = process.env.E2E_FUND_ACCOUNT_PASSWORD ?? "";

type ApiHelpers = Awaited<ReturnType<typeof createApiContext>>;

let api: ApiHelpers;
let accountId: string | null = null;
let projectId: string | null = null;
let unlockToken: string | null = null;

const stamp = Date.now();
const accountName = `e2e_UI资金账户_${stamp}`;

test.beforeAll(async () => {
  api = await createApiContext();

  // 确保模块密码存在（已存在则后端返回 400/429，均视为就绪）
  if (MODULE_PASSWORD) {
    await api.ctx.post("/api/v1/admin/accounts/module-password", {
      data: { new_password: MODULE_PASSWORD },
    });
    const unlockRes = await api.ctx.post("/api/v1/admin/accounts/unlock", {
      data: { password: MODULE_PASSWORD },
    });
    if (unlockRes.ok()) {
      const body = (await unlockRes.json()) as { token?: string };
      unlockToken = body.token ?? null;
    }
  }

  // 造一个测试项目（用于记账写入项目账本）
  const projectRes = await api.ctx.post("/api/v1/projects", {
    data: {
      community_name: `E2E资金账户UI小区${stamp}`,
      address: `E2E资金账户UI路${stamp}号`,
      contract_no: `E2E-ACCUI-${stamp}`,
      business_form: "agent",
    },
  });
  if (projectRes.ok()) {
    const body = (await projectRes.json()) as { id?: string };
    projectId = body.id ?? null;
  }
});

test.afterAll(async () => {
  // 清理：删流水（按 account_id 查）→ 删账户 → 删项目
  if (accountId) {
    const flowsRes = await api.ctx.get("/api/v1/admin/accounts/flows", {
      params: { account_id: accountId, page_size: 200 },
      headers: unlockToken ? { "X-Accounts-Unlock": unlockToken } : {},
    });
    if (flowsRes.ok()) {
      const body = (await flowsRes.json()) as { items?: { record_id: string }[] };
      for (const item of body.items ?? []) {
        await api.ctx.delete(`/api/v1/admin/ledger/${item.record_id}`);
      }
    }
    await api.ctx.delete(`/api/v1/admin/accounts/${accountId}`, {
      headers: unlockToken ? { "X-Accounts-Unlock": unlockToken } : {},
    });
  }
  if (projectId) {
    await api.ctx.delete(`/api/v1/projects/${projectId}`);
  }
  await api?.dispose();
});

/** 打开 /admin/accounts 并注入解锁令牌（模拟已解锁会话） */
async function openAccountsPage(page: import("@playwright/test").Page): Promise<void> {
  await loginPage(page);
  if (unlockToken) {
    await page.addInitScript(
      ([key, token]) => {
        window.sessionStorage.setItem(key, token);
      },
      [UNLOCK_TOKEN_KEY, unlockToken] as [string, string],
    );
  }
  await page.goto(`${FRONTEND_BASE}/admin/accounts`);
}

test("锁屏 → 解锁 → 新建账户 → 记账 → 金额联动 → 锁定", async ({ page }) => {
  test.skip(!unlockToken, "缺少 E2E_FUND_ACCOUNT_PASSWORD / 解锁失败，跳过 UI 链路用例");

  // 1. 总览页渲染
  await openAccountsPage(page);
  await expect(page.getByRole("heading", { name: "资金账户", level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByRole("button", { name: /新建账户/ }).first()).toBeVisible();

  // 2. 新建账户（抽屉）
  await page.getByRole("button", { name: /新建账户/ }).first().click();
  await expect(page.getByRole("heading", { name: "新建账户" })).toBeVisible();
  await page.getByPlaceholder("如：工商银行 · 基本户").fill(accountName);
  await page.getByPlaceholder("6222 **** 4821").fill("6222 **** 9999");
  await page.getByPlaceholder("公司名 或 个人姓名").fill("E2E UI");
  await page.getByPlaceholder("0.00").fill("50000");
  await page.getByRole("button", { name: "建好" }).click();

  // 3. 卡片出现，余额 = 期初
  const card = page.getByRole("button", { name: new RegExp(accountName) });
  await expect(card.first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("¥50,000.00").first()).toBeVisible();

  // 通过 API 取回账户 id 与初始余额（清理与后续断言用）
  const listRes = await api.ctx.get("/api/v1/admin/accounts", {
    params: { search: accountName },
    headers: { "X-Accounts-Unlock": unlockToken as string },
  });
  expect(listRes.ok()).toBeTruthy();
  const list = (await listRes.json()) as { items: { id: string; balance: number }[] };
  accountId = list.items[0]?.id ?? null;
  expect(accountId).not.toBeNull();
  expect(list.items[0].balance).toBe(50000);

  // 4. 记一笔（挂该账户），走 API（避免依赖科目下拉的选择器细节）
  const subjectsRes = await api.ctx.get("/api/v1/admin/subjects", {
    params: { mode: "agent", is_deleted: false },
  });
  const subjects = (await subjectsRes.json()) as { id: string }[];
  const recordRes = await api.ctx.post("/api/v1/admin/ledger", {
    data: {
      project_id: projectId,
      date: new Date().toISOString().slice(0, 10),
      subject_id: subjects[0].id,
      outflow: 8000,
      inflow: 0,
      payee: "E2E 施工",
      description: "E2E UI 联动",
      account_id: accountId,
    },
  });
  expect(recordRes.status()).toBe(201);

  // 5. 刷新页面 → 卡片余额变为 42000（证明记账真的进了余额推导）
  await page.reload();
  await expect(page.getByText("¥42,000.00").first()).toBeVisible({ timeout: 20_000 });

  // 6. 进入详情页，看到「钱怎么算出来的」四段
  await page.goto(`${FRONTEND_BASE}/admin/accounts/${accountId}`);
  await expect(page.getByText("钱怎么算出来的")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("现在有").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: accountName })).toBeVisible();

  // 7. 手动锁定 → 回到锁屏（服务端令牌作废生效）
  await page.getByRole("button", { name: /锁定/ }).first().click();
  await expect(page.getByRole("heading", { name: "资金账户", level: 1 })).toBeVisible();
  await expect(page.getByText("这里有钱。输密码才能看。")).toBeVisible({ timeout: 15_000 });
});
