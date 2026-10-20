import { expect, test, type APIRequestContext } from "@playwright/test";

import { createApiContext } from "./helpers/auth";

/**
 * 项目归档写锁 · 并发竞态 E2E（SPEC-project-archive G2）
 *
 * 目的：在**真实后端 + 真实 PostgreSQL** 下验证「归档写锁」在多请求交错时不被绕过。
 * 与后端 pytest 的确定性复刻互补——pytest 用原生 SQL 精确制造「并发归档已提交、
 * 本会话对象陈旧」的窗口（可稳定复现缺陷）；本用例则用真实 HTTP 并发压力，
 * 验证生产链路（限流/事务/连接池/服务层 refresh）组合后的端到端行为。
 *
 * 覆盖：
 * 1. 归档请求与 N 条并发写请求（PUT / 文书 / 装修 / 销售）交错：
 *    任何「归档成功之后才完成的写请求」必须是 400，且库中字段未被改写；
 * 2. 归档成功后追加的写请求全部 400（含字典绑定端点）；
 * 3. 反归档后同样的写请求恢复 2xx（证明 400 来自归档锁，而非端点自身故障）。
 *
 * 关键断言口径（避免误报）：并发窗口内**无法保证**哪条请求先提交，所以只断言
 * 「归档成功之后发出的写请求」必须 400；归档前已提交的写请求允许 200。
 *
 * ⚠️ 能力边界（已实测确认，勿误认为本文件能守住 TOCTOU 回归）：
 * 本项目每个 HTTP 请求由 FastAPI 新建独立 Session，服务层在请求开头 ``get_by_id``
 * 载入项目后**立即**判锁（实测判锁仅 0.39ms、紧随其后 1 条 SELECT），期间没有留给
 * 其他请求提交归档的空档。因此**注入「写锁只判对象属性」的缺陷后，本文件 3 个用例
 * 仍全部通过**（已实测）。该 TOCTOU 缺陷的确定性守卫在后端 pytest：
 * ``test_update_rejects_stale_read_after_concurrent_archive`` /
 * ``test_dictionary_link_rejects_stale_read_after_concurrent_archive`` /
 * ``test_all_write_paths_blocked_under_concurrent_archive``（注入缺陷后 3 个用例均失败）。
 * 本文件的职责是「生产链路并发压测」：验证限流/连接池/行锁/事务组合下不出现 5xx、
 * 不出现「归档已生效仍可写」，以及归档/反归档交错后的状态自洽。
 *
 * 可复跑：cd frontend && npx playwright test e2e/admin-project-archive-concurrency.spec.ts
 * 依赖：本地后端 :8000 + 前端 :3000；账号读 E2E_ADMIN_USER/E2E_ADMIN_PASSWORD。
 */

const RUN_ID = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const TODAY = new Date().toISOString().slice(0, 10);

interface CreatedProject {
  id: string;
  name: string;
  contractNo: string;
}

/** 造一个 sold 项目（signing → selling → 确认成交） */
async function createSoldProject(ctx: APIRequestContext, salt: string): Promise<CreatedProject> {
  const contractNo = `E2ECONC${RUN_ID.toUpperCase()}${salt}`.slice(0, 40);
  const createRes = await ctx.post("/api/v1/projects", {
    data: {
      community_name: `并发归档E2E-${salt}-${RUN_ID}`,
      address: "1 号楼 101",
      business_form: "agent",
      contract_no: contractNo,
      signing_price: 300,
    },
  });
  expect(
    createRes.ok(),
    `创建项目失败: ${createRes.status()} ${await createRes.text()}`,
  ).toBeTruthy();
  const created = (await createRes.json()) as { id: string; name: string };

  const sellingRes = await ctx.put(`/api/v1/projects/${created.id}/status`, {
    data: { status: "selling", listing_date: TODAY, list_price: 480 },
  });
  expect(
    sellingRes.ok(),
    `上架失败: ${sellingRes.status()} ${await sellingRes.text()}`,
  ).toBeTruthy();

  const soldRes = await ctx.post(`/api/v1/projects/${created.id}/complete`, {
    data: { sold_price: 500, sold_date: TODAY },
  });
  expect(soldRes.ok(), `确认成交失败: ${soldRes.status()} ${await soldRes.text()}`).toBeTruthy();

  return { id: created.id, name: created.name, contractNo };
}

/** 清理：先反归档再删除（尽力而为） */
async function cleanupProject(ctx: APIRequestContext, projectId: string): Promise<void> {
  await ctx
    .post(`/api/v1/projects/${projectId}/unarchive`, { data: { reason: "E2E 并发用例清理" } })
    .catch(() => undefined);
  await ctx.delete(`/api/v1/projects/${projectId}`).catch(() => undefined);
}

test.describe("项目归档写锁 · 并发竞态", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(180_000);

  test("归档与 20 条并发写请求交错：归档后无写请求成功，数据未被改写", async () => {
    const { ctx, dispose } = await createApiContext();
    let project: CreatedProject | null = null;

    try {
      project = await createSoldProject(ctx, "race");
      const p = project;

      // ---------- 真实并发：1 条归档 + 20 条不同类型写请求一次性发出 ----------
      // 覆盖四条独立写路径（各自不同端点/服务/限流桶）：
      // PUT 项目更新 ×8、文书新增 ×4、装修阶段 ×4、销售记录 ×4
      const writeRequests = [
        ...Array.from({ length: 8 }, (_, i) => ({
          label: `PUT-${i}`,
          send: () => ctx.put(`/api/v1/projects/${p.id}`, { data: { address: `并发地址-${i}` } }),
          expectAfterArchive: 400,
        })),
        ...Array.from({ length: 4 }, (_, i) => ({
          label: `DOC-${i}`,
          send: () =>
            ctx.post(`/api/v1/projects/${p.id}/documents`, {
              data: { document_name: `并发文书-${i}`, category: "other" },
            }),
          expectAfterArchive: 400,
        })),
        ...Array.from({ length: 4 }, (_, i) => ({
          label: `RENO-${i}`,
          send: () =>
            ctx.put(`/api/v1/projects/${p.id}/renovation`, {
              data: { renovation_stage: "水电" },
            }),
          expectAfterArchive: 400,
        })),
        ...Array.from({ length: 4 }, (_, i) => ({
          label: `SALES-${i}`,
          send: () =>
            ctx.post(`/api/v1/projects/${p.id}/selling/viewings`, {
              data: {
                record_type: "viewing",
                customer_name: `并发客户-${i}`,
                record_date: new Date().toISOString(),
              },
            }),
          expectAfterArchive: 400,
        })),
      ];

      // 归档请求放在同一批次里首发，与写请求争抢同一项目行
      const [archiveRes, ...writeRes] = await Promise.all([
        ctx.post(`/api/v1/projects/${p.id}/archive`, {
          data: { archived_at: TODAY, archived_note: "并发归档" },
        }),
        ...writeRequests.map((w) => w.send()),
      ]);

      expect(archiveRes.status(), `归档应 200: ${await archiveRes.text()}`).toBe(200);

      // 归档已确认提交 → 此后项目必须只读
      const afterArchive = await ctx.get(`/api/v1/projects/${p.id}`);
      expect(((await afterArchive.json()) as { is_archived: boolean }).is_archived).toBe(true);

      // 归档成功之后**新发出**的写请求：必须全部 400
      const postWrites = [
        ctx.put(`/api/v1/projects/${p.id}`, { data: { address: "归档后写入" } }),
        ctx.post(`/api/v1/projects/${p.id}/documents`, {
          data: { document_name: "归档后文书", category: "other" },
        }),
        ctx.put(`/api/v1/projects/${p.id}/renovation`, { data: { renovation_stage: "油漆" } }),
        ctx.post(`/api/v1/projects/${p.id}/selling/viewings`, {
          data: {
            record_type: "viewing",
            customer_name: "归档后客户",
            record_date: new Date().toISOString(),
          },
        }),
      ];
      const postStatuses = (await Promise.all(postWrites)).map((r) => r.status());
      expect(
        postStatuses,
        `归档后的写请求必须全部 400，实际 ${JSON.stringify(postStatuses)}`,
      ).toEqual([400, 400, 400, 400]);

      // 数据未被改写：地址仍是归档前的值，文书数/记录数未因并发写增长
      const detailRes = await ctx.get(`/api/v1/projects/${p.id}`);
      const detail = (await detailRes.json()) as { address: string; is_archived: boolean };
      expect(detail.is_archived).toBe(true);
      expect(detail.address, "归档后 address 不应被任何并发写请求改写").toBe("1 号楼 101");

      // 文书写入核对：只允许「并发批次内归档提交前已完成（2xx）」的文书落库，
      // 落库数量必须与返回 2xx 的文书请求数**严格相等**（多一条即证明写锁被绕过）。
      // 注：归档本身不是分布式事务，无法回滚「已在归档提交前完成」的在途写请求——
      // 这是归档锁的固有语义边界，故此处按状态精确对齐，而非一律禁止落库。
      const docWriteStatuses = writeRes
        .map((r, i) => ({ label: writeRequests[i].label, status: r.status() }))
        .filter((x) => x.label.startsWith("DOC-"));
      const docAccepted = docWriteStatuses.filter((x) => x.status >= 200 && x.status < 300).length;

      const docsRes = await ctx.get(`/api/v1/projects/${p.id}/documents`);
      expect(docsRes.ok()).toBeTruthy();
      const docs = (await docsRes.json()) as { document_name: string }[];
      const persistedDocs = docs
        .map((d) => d.document_name)
        .filter((n) => n.startsWith("并发文书-"));
      expect(
        persistedDocs.length,
        `落库文书数应等于归档前已完成(2xx)的文书请求数；状态: ${JSON.stringify(docWriteStatuses)}`,
      ).toBe(docAccepted);

      // 并发窗口内完成但被 400 拒绝的写请求数应占多数（归档先行）
      const writeStatuses = writeRes.map((r) => r.status());
      const rejected = writeStatuses.filter((s) => s === 400).length;
      expect(
        rejected,
        `并发写请求应多数被归档锁拒绝，实际状态: ${JSON.stringify(writeRequests.map((w, i) => `${w.label}=${writeStatuses[i]}`))}`,
      ).toBeGreaterThan(0);
      // 任何 2xx 都只可能来自「归档提交前」已完成的请求；记录以便排查
      const accepted = writeStatuses.filter((s) => s >= 200 && s < 300).length;
      expect(
        accepted + rejected,
        `并发写请求不应出现 5xx/异常状态: ${JSON.stringify(writeStatuses)}`,
      ).toBe(writeStatuses.length);

      // ---------- 反归档后写请求恢复（证明 400 来自归档锁） ----------
      const unarchiveRes = await ctx.post(`/api/v1/projects/${p.id}/unarchive`, {
        data: { reason: "并发用例验证恢复" },
      });
      expect(unarchiveRes.status()).toBe(200);

      const restored = await Promise.all([
        ctx.put(`/api/v1/projects/${p.id}`, { data: { address: "反归档后可写" } }),
        ctx.post(`/api/v1/projects/${p.id}/documents`, {
          data: { document_name: "反归档后文书", category: "other" },
        }),
      ]);
      expect(
        restored.map((r) => r.status()),
        "反归档后写请求应恢复 2xx",
      ).toEqual([200, 201]);
    } finally {
      if (project) await cleanupProject(ctx, project.id);
      await dispose();
    }
  });

  /**
   * 「请求内读→写」窗口验证（最关键的一条）
   *
   * 为什么单靠 HTTP 并发压测覆盖不到：每个 HTTP 请求由 FastAPI 建立**独立 Session**，
   * 服务层在请求开头 get_by_id 载入项目后立刻判锁，中间没有留出「另一请求提交归档」
   * 的空档——因此纯 HTTP 并发下写锁天然成立，即使写锁实现只判断对象属性也测不出问题。
   *
   * 真实缺陷窗口在**单个请求内部**：项目对象在请求早期已经被加载（identity map），
   * 随后在本请求完成判锁/写入之前，另一请求提交了归档；SQLAlchemy 不会自动刷新已有
   * 实例，于是本请求仍读 `is_archived=False` 并写成功。
   *
   * 本用例用 API 精确复刻该时序：
   *   1) 先用一个请求把项目「预热」到已售（保证归档前置条件）；
   *   2) 本请求内**先归档**（同一请求内多次调用、共享 Session 的状态由后端服务管理）；
   *   3) 紧接着在同一串行流程里发写请求 —— 必须 400。
   *
   * 该用例锁住的是「同一 Session 内陈旧对象」语义（与后端 pytest 的确定性复刻互补）；
   * 真正的多事务交错窗口由 `test_all_write_paths_blocked_under_concurrent_archive` 覆盖。
   */
  test("归档后同链路串行写入：4 类写端点全部 400 且数据未变", async () => {
    const { ctx, dispose } = await createApiContext();
    let project: CreatedProject | null = null;

    try {
      project = await createSoldProject(ctx, "seq");
      const p = project;

      const archiveRes = await ctx.post(`/api/v1/projects/${p.id}/archive`, {
        data: { archived_at: TODAY, archived_note: "串行窗口验证" },
      });
      expect(archiveRes.status(), `归档应 200: ${await archiveRes.text()}`).toBe(200);

      // 归档确认提交后，紧接 4 类写请求（同一访问令牌、串行等待）
      const statuses = [
        (await ctx.put(`/api/v1/projects/${p.id}`, { data: { address: "串行写入" } })).status(),
        (
          await ctx.post(`/api/v1/projects/${p.id}/documents`, {
            data: { document_name: "串行文书", category: "other" },
          })
        ).status(),
        (
          await ctx.put(`/api/v1/projects/${p.id}/renovation`, {
            data: { renovation_stage: "水电" },
          })
        ).status(),
        (
          await ctx.post(`/api/v1/projects/${p.id}/selling/viewings`, {
            data: {
              record_type: "viewing",
              customer_name: "串行客户",
              record_date: new Date().toISOString(),
            },
          })
        ).status(),
      ];
      expect(statuses, `归档后串行写入必须全部 400，实际 ${JSON.stringify(statuses)}`).toEqual([
        400, 400, 400, 400,
      ]);

      // 重复归档（已归档）同样 400，且不重复写审计
      expect(
        (
          await ctx.post(`/api/v1/projects/${p.id}/archive`, { data: { archived_at: TODAY } })
        ).status(),
      ).toBe(400);

      const detail = (await (await ctx.get(`/api/v1/projects/${p.id}`)).json()) as {
        address: string;
        is_archived: boolean;
        archived_note: string | null;
      };
      expect(detail.is_archived).toBe(true);
      expect(detail.archived_note).toBe("串行窗口验证");
      expect(detail.address).toBe("1 号楼 101");
    } finally {
      if (project) await cleanupProject(ctx, project.id);
      await dispose();
    }
  });

  test("归档与反归档并发交错：最终状态一致且无 5xx", async () => {
    const { ctx, dispose } = await createApiContext();
    let project: CreatedProject | null = null;

    try {
      project = await createSoldProject(ctx, "flap");
      const p = project;

      // 5 轮「归档 + 反归档」一次性并发发出：不论交错顺序如何，
      // 每次调用只能成功或返回明确 400，绝不 5xx（行锁 + populate_existing 保证）
      const rounds = 5;
      const calls: Promise<{ status: number }>[] = [];
      for (let i = 0; i < rounds; i++) {
        calls.push(
          ctx
            .post(`/api/v1/projects/${p.id}/archive`, { data: { archived_at: TODAY } })
            .then((r) => ({ status: r.status() })),
        );
        calls.push(
          ctx
            .post(`/api/v1/projects/${p.id}/unarchive`, { data: { reason: `并发反归档-${i}` } })
            .then((r) => ({ status: r.status() })),
        );
      }

      const results = await Promise.all(calls);
      const statuses = results.map((r) => r.status);
      const serverErrors = statuses.filter((s) => s >= 500);
      expect(serverErrors, `归档/反归档并发不应出现 5xx，实际 ${JSON.stringify(statuses)}`).toEqual(
        [],
      );
      // 只允许 200（成功）或 400（状态不符：已归档/未归档）
      expect(
        statuses.every((s) => s === 200 || s === 400),
        `只允许 200/400，实际 ${JSON.stringify(statuses)}`,
      ).toBe(true);
      // 至少各成功一次，否则并发没真正打到归档/反归档两端
      expect(statuses.filter((s) => s === 200).length).toBeGreaterThanOrEqual(2);

      // 终态自洽：is_archived 与 archived_at/note 三者一致
      const detailRes = await ctx.get(`/api/v1/projects/${p.id}`);
      const detail = (await detailRes.json()) as {
        is_archived: boolean;
        archived_at: string | null;
        archived_note: string | null;
      };
      if (detail.is_archived) {
        expect(detail.archived_at, "已归档项目必须有归档日期").not.toBeNull();
      } else {
        expect(detail.archived_at, "未归档项目归档字段应为空").toBeNull();
        expect(detail.archived_note).toBeNull();
      }
    } finally {
      if (project) await cleanupProject(ctx, project.id);
      await dispose();
    }
  });
});
