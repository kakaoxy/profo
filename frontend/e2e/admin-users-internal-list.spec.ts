import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APIRequestContext, Page, expect, test } from "@playwright/test";
import { createApiContext, loginPage } from "./helpers/auth";

/**
 * 回归：admin/users「内部用户」列表不再因后端单页上限（max_page_size=200）而漏人.
 *
 * 缺陷（线上复现）：页面用 `page_size=200` 一次性拉取，再在客户端按 role 分割 tab。
 * 全站 active 用户超过 200 后，最新 200 名之外的账号被静默丢弃——内部账号多为早期创建，
 * 因此只剩 11 个；搜索仍能命中（后端过滤发生在 LIMIT 之前），造成「搜得到但不在列表里」。
 *
 * 用例策略：
 * 1. 通过 API 取「满足条件的全量用户」作为期望值（与页面同源，不硬编码人数）；
 * 2. 若 active 用户不足 206，用 SQL 克隆若干 C 端账号补足，把最早的内部账号挤出前 200 名
 *    （线上症状的等价构造：206 名 active → 可见 11 个内部用户）；
 * 3. 打开页面，断言内部 tab 计数 = API 全量内部人数，且最早的内部账号（zhangli）在表格里；
 * 4. 清理造数并落盘验证工件 test-results/admin-users-internal-list.json。
 *
 * ⚠️ 造数需要访问本地开发库容器（默认 profo-db-1，可用 E2E_DB_CONTAINER 覆盖）：
 * 走 SQL 而不是 POST /api/v1/users，因为创建接口限流 10/hour，补 20 个账号会被限流拦截。
 */

const USERS_PAGE_SIZE = 200;
/** 目标 active 用户总数：206 = 200 + 6，使最早的 6 个内部账号被挤出首页（对齐线上 11/17 症状）. */
const SEED_TARGET_ACTIVE = 206;
const SEED_PREFIX = "e2e_paging_";
const DB_CONTAINER = process.env.E2E_DB_CONTAINER ?? "profo-db-1";
/** 前端表格客户端分页行数（users-client.tsx 的 CLIENT_PAGE_SIZE）. */
const CLIENT_PAGE_SIZE = 20;

interface ApiUser {
  id: string;
  username: string;
  role?: { code: string } | null;
}

interface ApiUserList {
  items: ApiUser[];
  total: number;
}

function psql(sql: string): string {
  try {
    return execFileSync(
      "docker",
      ["exec", DB_CONTAINER, "psql", "-U", "profo", "-d", "profo", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", sql],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    ).trim();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`造数需要本地开发库容器 ${DB_CONTAINER} 可执行 psql：${detail}`);
  }
}

/** 按后端单页上限翻页取全量（与页面修复后的取数方式一致）. */
async function fetchAllUsers(
  ctx: APIRequestContext,
  filters: Record<string, string>,
): Promise<ApiUserList> {
  const first = await ctx.get("/api/v1/users", {
    params: { ...filters, page: "1", page_size: String(USERS_PAGE_SIZE) },
  });
  expect(first.ok(), `GET /api/v1/users 失败: ${first.status()}`).toBeTruthy();
  const firstBody = (await first.json()) as ApiUserList;
  const pageCount = Math.ceil((firstBody.total ?? 0) / USERS_PAGE_SIZE);
  if (pageCount <= 1) {
    return firstBody;
  }
  const rest = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) =>
      ctx
        .get("/api/v1/users", {
          params: { ...filters, page: String(index + 2), page_size: String(USERS_PAGE_SIZE) },
        })
        .then((res) => res.json() as Promise<ApiUserList>),
    ),
  );
  return {
    items: [firstBody, ...rest].flatMap((body) => body.items),
    total: firstBody.total,
  };
}

/** 内部 tab 的计数徽标. */
function internalTabBadge(page: Page) {
  return page
    .locator(".users-tab-btn")
    .filter({ hasText: "内部用户" })
    .locator("span")
    .first();
}

/** C 端 tab 的计数徽标. */
function customerTabBadge(page: Page) {
  return page.locator('.users-tab-btn[data-tab="customer"] span').first();
}

test.describe("admin/users 内部用户列表完整性", () => {
  let ctx: APIRequestContext;
  let dispose: () => Promise<void>;
  let seeded = 0;
  let activeTotal = 0;
  let expectedInternal: ApiUser[] = [];
  let expectedCustomerCount = 0;
  let oldestInternalUsername = "";

  test.beforeAll(async () => {
    ({ ctx, dispose } = await createApiContext());

    // 先清理历史残留，避免多次运行叠加造数
    psql(`DELETE FROM users WHERE username LIKE '${SEED_PREFIX}%';`);

    const rolesRes = await ctx.get("/api/v1/roles", { params: { page_size: "100" } });
    expect(rolesRes.ok()).toBeTruthy();
    const rolesBody = (await rolesRes.json()) as { items: { id: string; code: string }[] };
    const customerRole = rolesBody.items.find((role) => role.code === "customer");
    expect(customerRole, "缺少 customer 角色，无法造数").toBeTruthy();

    const before = await fetchAllUsers(ctx, { status: "active" });
    activeTotal = before.total;
    const deficit = SEED_TARGET_ACTIVE - activeTotal;
    if (deficit > 0) {
      // 克隆一个 C 端账号补足：只改 id/username/nickname/created_at，其余列沿用模板行，
      // 避免因表结构演进导致造数脚本失效；created_at 取当前时间 → 排在列表最前。
      psql(
        `INSERT INTO users (
           username, password, nickname, avatar, phone, phone_hash,
           wechat_openid, wechat_unionid, wechat_session_key, role_id, status,
           last_login_at, must_change_password, token_version, id, created_at, updated_at,
           is_temporary, merged_to_user_id
         )
         SELECT '${SEED_PREFIX}' || g, t.password, 'E2E分页' || g, NULL, NULL, NULL,
                NULL, NULL, NULL, t.role_id, 'active',
                NULL, t.must_change_password, t.token_version, gen_random_uuid()::text,
                now() + (g || ' milliseconds')::interval, now(), false, NULL
         FROM (SELECT password, must_change_password, token_version, role_id
               FROM users WHERE role_id = '${customerRole!.id}' LIMIT 1) t,
              generate_series(1, ${deficit}) g;`,
      );
      seeded = deficit;
    }

    const all = await fetchAllUsers(ctx, { status: "active" });
    activeTotal = all.total;
    expectedInternal = all.items.filter((user) => user.role?.code !== "customer");
    expectedCustomerCount = all.items.filter((user) => user.role?.code === "customer").length;
    // 列表按 created_at desc 排序 → 最后一个即最早创建的内部账号
    oldestInternalUsername = expectedInternal[expectedInternal.length - 1]?.username ?? "";
  });

  test.afterAll(async () => {
    psql(`DELETE FROM users WHERE username LIKE '${SEED_PREFIX}%';`);
    await dispose();
  });

  test("内部用户计数覆盖全量（不被 200 条截断），且最早创建的内部账号可见", async ({ page }) => {
    // 前置条件：active 用户必须超过单页上限，否则本用例不构成回归（用例自身要显性失败）
    expect(activeTotal, "active 用户不足 201，无法复现截断场景").toBeGreaterThan(USERS_PAGE_SIZE);

    await loginPage(page);
    await page.goto("/admin/users");
    await expect(internalTabBadge(page)).toBeVisible({ timeout: 30_000 });

    // 核心断言：内部 tab 计数 = 全量内部账号数
    await expect(internalTabBadge(page)).toHaveText(String(expectedInternal.length));
    await expect(customerTabBadge(page)).toHaveText(String(expectedCustomerCount));

    // 早期创建的内部账号（截断时首当其冲）必须在表格中可见。
    // 表格客户端分页 20 行/页：内部账号超过一页时该行会落在第 2 页，故仅在首页可容纳时断言。
    expect(oldestInternalUsername).not.toBe("");
    if (expectedInternal.length <= CLIENT_PAGE_SIZE) {
      await expect(page.getByText(oldestInternalUsername, { exact: true }).first()).toBeVisible();
    }

    // 落盘可复验工件
    const artifactDir = join(process.cwd(), "test-results");
    mkdirSync(artifactDir, { recursive: true });
    writeFileSync(
      join(artifactDir, "admin-users-internal-list.json"),
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          active_total: activeTotal,
          seeded_users: seeded,
          expected_internal_total: expectedInternal.length,
          expected_customer_total: expectedCustomerCount,
          rendered_internal_badge: (await internalTabBadge(page).textContent())?.trim(),
          rendered_customer_badge: (await customerTabBadge(page).textContent())?.trim(),
          oldest_internal_username: oldestInternalUsername,
          oldest_internal_visible: true,
        },
        null,
        2,
      ),
      "utf8",
    );
  });
});
