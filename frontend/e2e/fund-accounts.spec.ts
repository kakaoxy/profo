import { execFileSync } from "node:child_process";
import path from "node:path";
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

/**
 * ⚠️ 串行执行（2026-10-22 修复 flaky）：
 * 本文件的两个用例共享模块级 ``accountId`` / ``projectId`` / ``unlockToken``，
 * 且第二个用例会**故意打满** module-password 的限流额度。Playwright 默认
 * fullyParallel 会让两个 worker 同时建项目、同时动同一个 admin 的限流桶：
 * 实测并行时 ``beforeAll`` 建项目撞 409（两个 worker 的 ``Date.now()`` 同一毫秒，
 * ``contract_no`` 重复），``projectId`` 静默为 null，记账请求变成
 * ``project_id: null`` → 422，报错信息完全指不到真正原因。
 * 这些用例本质上共享同一份后端状态，必须串行。
 */
test.describe.configure({ mode: "serial" });

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
  } else {
    // Fail Loud：建项目失败会让下游「记账」变成 project_id=null 的 422，
    // 报错完全指不到根因（实测踩过）。这里直接把状态码与响应体抛出来。
    throw new Error(`造测试项目失败：${projectRes.status()} ${await projectRes.text()}`);
  }
  expect(projectId, "测试项目必须创建成功").toBeTruthy();
});

test.afterAll(async () => {
  // ⚠️ 先重新解锁（2026-10-22 修复）：第一个用例结尾会点「锁定」，服务端随即吊销令牌，
  // 此处若沿用旧 unlockToken，后面的 DELETE 全是 403 —— 实测每跑一次就遗留一个
  // e2e_UI资金账户_* 脏账户，且清理静默失败（旧代码没断言状态码）。
  if (MODULE_PASSWORD) {
    const relock = await api.ctx.post("/api/v1/admin/accounts/unlock", {
      data: { password: MODULE_PASSWORD },
    });
    if (relock.ok()) {
      unlockToken = ((await relock.json()) as { token?: string }).token ?? unlockToken;
    }
  }
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
    const delRes = await api.ctx.delete(`/api/v1/admin/accounts/${accountId}`, {
      headers: unlockToken ? { "X-Accounts-Unlock": unlockToken } : {},
    });
    // 不静默失败：删不掉要把原因写进测试输出，否则脏数据会一直累积
    if (!delRes.ok()) {
      console.warn(`清理账户 ${accountId} 失败：${delRes.status()} ${await delRes.text()}`);
    }
  }
  if (projectId) {
    await api.ctx.delete(`/api/v1/projects/${projectId}`);
  }

  // 最后统一扫一遍：afterAll 自己也会 unlock（为了清理），会产生新的令牌与限流计数；
  // 不清掉的话，共享环境里会留下「别人能用的解锁令牌」和已消耗的额度。
  try {
    execFileSync(
      path.resolve(__dirname, "../../backend/.venv/bin/python"),
      [
        "-c",
        [
          "import redis",
          "from settings import settings",
          "r=redis.Redis.from_url(settings.redis_url)",
          "[r.delete(k) for p in ('LIMITS:*accounts/unlock*','LIMITS:*module-password*','fund_accounts:*') for k in r.scan_iter(p)]",
        ].join("\n"),
      ],
      { cwd: path.resolve(__dirname, "../../backend"), stdio: "pipe" },
    );
  } catch (exc) {
    console.warn("清理限流桶/解锁令牌失败：", exc);
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
  await page
    .getByRole("button", { name: /新建账户/ })
    .first()
    .click();
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

/**
 * 「改密码被限流」的 UI 回归（2026-10-22 缺陷）.
 *
 * 缺陷现象（用户截图）：正常改密码时弹出「请求过于频繁，请稍后重试」，并且
 * 「新密码」输入框被描成红框、错误文案挤在字段下方把两列栅格撑歪。
 *
 * 两个独立根因，本用例分别锁定：
 *   1. 后端 429 文案不可行动 —— 只说「稍后重试」，不说额度多少、要等多久；
 *   2. 前端把**服务端错误**塞进 ``errors.password`` —— 既标红了一个内容完全正确的
 *      字段（aria-invalid），又把长文案放进栅格单元。
 *
 * 验证方式：用错的旧密码把额度打满（400 不改密码，语义安全），再走真实 UI 提交，
 * 断言「出现表单级 banner」+「新密码输入框不再 aria-invalid」，并产出截图工件。
 * 结束时清空本用户的限流桶，避免占用真人的改密码额度。
 */
test("改密码被限流时：表单级提示且不标红字段（回归 2026-10-22）", async ({ page }, testInfo) => {
  test.skip(!MODULE_PASSWORD, "缺少 E2E_FUND_ACCOUNT_PASSWORD，跳过被测链路");

  // 前一个用例结尾会「手动锁定」，这里重新解锁拿新令牌
  const unlockRes = await api.ctx.post("/api/v1/admin/accounts/unlock", {
    data: { password: MODULE_PASSWORD },
  });
  test.skip(!unlockRes.ok(), "无法解锁资金账户模块，跳过（可能被锁定）");
  const unlocked = (await unlockRes.json()) as { token?: string };
  const token = unlocked.token;
  expect(token).toBeTruthy();

  // 用错的旧密码把 module-password 的额度打满（后端返回 400，不会改密码）
  let lastStatus = 0;
  let rateLimitedBody: { message?: string } | null = null;
  for (let i = 0; i < 25; i += 1) {
    const res = await api.ctx.post("/api/v1/admin/accounts/module-password", {
      data: { new_password: MODULE_PASSWORD, old_password: "000000" },
    });
    lastStatus = res.status();
    if (lastStatus === 429) {
      rateLimitedBody = (await res.json()) as { message?: string };
      break;
    }
  }
  expect(lastStatus, "应能打满限流额度以复现 429").toBe(429);
  // 文案必须可行动：含额度（每小时 N 次），不再是一句「请稍后重试」
  expect(rateLimitedBody?.message ?? "").toMatch(/每小时最多 \d+ 次/);

  try {
    await loginPage(page);
    await page.addInitScript(
      ([key, value]) => {
        window.sessionStorage.setItem(key, value);
      },
      [UNLOCK_TOKEN_KEY, token as string] as [string, string],
    );
    await page.goto(`${FRONTEND_BASE}/admin/accounts`);
    await expect(page.getByRole("heading", { name: "资金账户", level: 1 })).toBeVisible({
      timeout: 30_000,
    });

    // 打开「改密码」弹窗（页头倒计时按钮的 title 即入口）
    await page.getByTitle("改密码").click();
    await expect(page.getByRole("heading", { name: "改密码" })).toBeVisible();

    const oldInput = page.getByPlaceholder("••••••");
    const newInputs = page.getByPlaceholder("6 位数字");
    await oldInput.fill(MODULE_PASSWORD);
    await newInputs.nth(0).fill(MODULE_PASSWORD);
    const other = MODULE_PASSWORD === "135790" ? "135791" : "135790";
    await newInputs.nth(1).fill(other); // 先制造「两次输不一样」→ 改掉
    await newInputs.nth(1).fill(MODULE_PASSWORD);

    await page.getByRole("button", { name: "保存" }).click();

    // 断言 1：出现表单级 banner（role=alert），文案可行动。
    // 限定在弹窗内：页面的 sonner toast 容器也带 role，全局查会误命中。
    const banner = page.getByRole("dialog").getByRole("alert");
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText(/每小时最多 \d+ 次/);

    // 断言 2：字段没有被误标红（服务端错误与输入内容无关）
    await expect(newInputs.nth(0)).not.toHaveAttribute("aria-invalid", "true");
    await expect(newInputs.nth(1)).not.toHaveAttribute("aria-invalid", "true");
    await expect(oldInput).not.toHaveAttribute("aria-invalid", "true");

    // 工件：把「修复后」的弹窗截下来，供人工复核排版
    const shot = testInfo.outputPath("password-dialog-rate-limited.png");
    await page.screenshot({ path: shot, fullPage: false });
    await testInfo.attach("password-dialog-rate-limited", { path: shot, contentType: "image/png" });
  } finally {
    // 清理本用户的限流桶：不清理的话，真人管理员会在接下来一小时内改不了密码
    // （限流键按 user_id 计数，测试用的正是 admin 本人）。
    // 直接读 Redis 而不新增测试专用接口——后端容器/本机 Redis 与后端 E2E 脚本同源。
    try {
      execFileSync(
        path.resolve(__dirname, "../../backend/.venv/bin/python"),
        [
          "-c",
          "import redis\nfrom settings import settings\n" +
            "r=redis.Redis.from_url(settings.redis_url)\n" +
            "[r.delete(k) for p in ('LIMITS:*module-password*','LIMITS:*accounts/unlock*') " +
            "for k in r.scan_iter(p)]\n" +
            "print('rate-limit buckets cleared')",
        ],
        { cwd: path.resolve(__dirname, "../../backend"), stdio: "pipe" },
      );
    } catch (exc) {
      console.warn("清理限流桶失败（请手动清理 LIMITS:*module-password*）：", exc);
    }
  }
});

/** 用后端 venv 直接改密码哈希（测试收尾兜底，不经过 5/hour 的接口额度）. */
function restoreModulePasswordHash(): void {
  execFileSync(
    path.resolve(__dirname, "../../backend/.venv/bin/python"),
    [
      "-c",
      [
        "from db import SessionLocal",
        "from models import SystemConfig",
        "from utils.auth.password import get_password_hash",
        "db=SessionLocal()",
        "row=db.query(SystemConfig).filter(SystemConfig.key=='fund_accounts.password_hash').first()",
        "row.value=get_password_hash(__import__('os').environ['PW'])",
        "db.commit()",
        "db.close()",
        "print('password hash restored')",
      ].join("\n"),
    ],
    {
      cwd: path.resolve(__dirname, "../../backend"),
      stdio: "pipe",
      env: { ...process.env, PW: MODULE_PASSWORD },
    },
  );
}

/**
 * 正常改密码必须成功，且成功后干净地回到锁屏（回归 2026-10-22「正常改密码被 429」）.
 *
 * 断言三件事：
 *   1. 正常一次改密**不再** 429（额度按用户计、且提到 20/hour）；
 *   2. 改密成功后不再弹「资金账户未解锁」的错误（令牌被吊销是预期，但不应表现为失败）；
 *   3. 用新密码能重新解锁 —— 证明改密真的生效，而不是只关闭了弹窗。
 * 收尾无论成败都用 DB 精确还原密码，避免把共享环境改成随机值。
 */
test("正常改密码：成功且干净回到锁屏（回归 2026-10-22）", async ({ page }) => {
  test.skip(!MODULE_PASSWORD, "缺少 E2E_FUND_ACCOUNT_PASSWORD，跳过被测链路");
  const newPassword = MODULE_PASSWORD === "135790" ? "135791" : "135790";

  try {
    const unlockRes = await api.ctx.post("/api/v1/admin/accounts/unlock", {
      data: { password: MODULE_PASSWORD },
    });
    test.skip(!unlockRes.ok(), "无法解锁资金账户模块，跳过（可能被锁定）");
    const token = ((await unlockRes.json()) as { token?: string }).token;
    expect(token).toBeTruthy();

    await loginPage(page);
    await page.addInitScript(
      ([key, value]) => {
        window.sessionStorage.setItem(key, value);
      },
      [UNLOCK_TOKEN_KEY, token as string] as [string, string],
    );
    await page.goto(`${FRONTEND_BASE}/admin/accounts`);
    await expect(page.getByRole("heading", { name: "资金账户", level: 1 })).toBeVisible({
      timeout: 30_000,
    });

    await page.getByTitle("改密码").click();
    await expect(page.getByRole("heading", { name: "改密码" })).toBeVisible();
    await page.getByPlaceholder("••••••").fill(MODULE_PASSWORD);
    await page.getByPlaceholder("6 位数字").nth(0).fill(newPassword);
    await page.getByPlaceholder("6 位数字").nth(1).fill(newPassword);
    await page.getByRole("button", { name: "保存" }).click();

    // 1) 弹窗关闭（改密成功）
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 15_000 });
    // 2) 干净回到锁屏（改密成功 → invalidate，而不是沿用旧令牌发请求吃 403）
    await expect(page.getByText("这里有钱。输密码才能看。")).toBeVisible({ timeout: 20_000 });
    // 3) 关键：不该出现「资金账户未解锁」错误（旧实现改密后必弹这个，观感像失败）
    await expect(page.getByText(/资金账户未解锁/)).toHaveCount(0);

    // 4) 新密码可用 → 证明改密真的生效
    const reUnlock = await api.ctx.post("/api/v1/admin/accounts/unlock", {
      data: { password: newPassword },
    });
    expect(reUnlock.status(), "新密码应能解锁").toBe(200);
  } finally {
    restoreModulePasswordHash();
    // 清理限流桶与解锁令牌，避免占用真人额度 / 把模块留在锁定态
    execFileSync(
      path.resolve(__dirname, "../../backend/.venv/bin/python"),
      [
        "-c",
        [
          "import redis",
          "from settings import settings",
          "r=redis.Redis.from_url(settings.redis_url)",
          "[r.delete(k) for p in ('LIMITS:*module-password*','LIMITS:*accounts/unlock*','fund_accounts:*') for k in r.scan_iter(p)]",
        ].join("\n"),
      ],
      { cwd: path.resolve(__dirname, "../../backend"), stdio: "pipe" },
    );
  }
});
