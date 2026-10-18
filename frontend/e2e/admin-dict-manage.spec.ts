import { test, expect } from "@playwright/test";
import { loginPage, createApiContext, FRONTEND_BASE } from "./helpers/auth";

/**
 * 业务字典管理 E2E（techdebt-config-unify §7 验收 1/2 可复验工件）.
 *
 * 用例：
 * 1. 运营在 /admin/settings/dicts 改「改造阶段别名」展示名 → 保存成功；
 * 2. **前台渲染**：改造中项目详情页阶段 pill/当前阶段文案使用新展示名（字典生效）；
 * 3. 还原展示名 → 前台文案回到原值（证明消费方真实生效，不是只看保存成功）；
 * 4. 停用条目 → 公开只读端点不再下发（C 端/小程序下拉不会出现停用值）。
 *
 * 造数策略：改造中项目取现网第一条 renovating 项目（只读，不改数据）；
 * 字典条目改动在用例内创建并在 afterAll 还原，可重复执行。
 */

type ApiHelpers = Awaited<ReturnType<typeof createApiContext>>;

const STAGE_GROUP = "renovation_stage_alias";
const ORIGINAL_STAGE_CODE = "拆除";
const TEMPORARY_STAGE_LABEL = "拆除阶段E2E";

let api: ApiHelpers;
let projectId: string | null = null;
let stageItemId: string | null = null;

test.beforeAll(async () => {
  api = await createApiContext();

  // 取一条改造中项目（详情页会渲染改造阶段展示名）
  const res = await api.ctx.get("/api/v1/projects", {
    params: { status: "renovating", page: 1, page_size: 1 },
  });
  if (res.ok()) {
    const body = (await res.json()) as { items?: { id: string }[] };
    projectId = body.items?.[0]?.id ?? null;
  }

  // 记录「拆除」条目 id，供还原
  const itemsRes = await api.ctx.get(`/api/v1/admin/dicts/${STAGE_GROUP}/items`);
  if (itemsRes.ok()) {
    const items = (await itemsRes.json()) as { id: string; code: string }[];
    stageItemId = items.find((item) => item.code === ORIGINAL_STAGE_CODE)?.id ?? null;
  }
});

test.afterAll(async () => {
  // 注意：展示名还原在用例内 finally 完成（不能放在 afterAll —— fullyParallel 下
  // 另一个 worker 的 afterAll 会把正在验证的临时展示名提前还原，造成假失败）
  await api?.dispose();
});

/** 还原阶段展示名（用例内调用，失败不静默） */
async function restoreStageLabel(): Promise<void> {
  if (!stageItemId) return;
  const res = await api.ctx.put(`/api/v1/admin/dicts/${STAGE_GROUP}/items/${stageItemId}`, {
    data: { label: ORIGINAL_STAGE_CODE, enabled: true },
  });
  expect(res.ok()).toBeTruthy();
}

test.beforeEach(async ({ page }) => {
  await loginPage(page);
});

test("改动改造阶段展示名 → 前台项目详情即时生效 → 还原后回滚", async ({ page }) => {
  test.skip(!projectId, "环境缺少 renovating 项目，无法验证前台渲染");
  test.skip(!stageItemId, "环境缺少 renovation_stage_alias.拆除 字典条目");

  // 0. 归一化历史遗留状态（上次中断的用例可能把展示名留在临时值）
  await restoreStageLabel();

  // 1. 打开字典管理页，选中「改造阶段别名」
  await page.goto(`${FRONTEND_BASE}/admin/settings/dicts`);
  await expect(page.getByRole("heading", { name: "业务字典" })).toBeVisible();
  await page.getByTestId(`dict-group-${STAGE_GROUP}`).click();

  const row = page.getByTestId(`dict-row-${ORIGINAL_STAGE_CODE}`);
  await expect(row).toBeVisible();

  try {
    // 2. 改展示名并保存
    const labelInput = row.getByLabel(`展示名-${ORIGINAL_STAGE_CODE}`);
    await labelInput.fill(TEMPORARY_STAGE_LABEL);
    await row.getByRole("button", { name: "保存" }).click();
    await expect(page.getByText("已保存")).toBeVisible();

    // 3. 前台渲染：改造中项目详情页使用新展示名（项目详情只读，不改业务数据）
    await page.goto(`${FRONTEND_BASE}/admin/projects/${projectId}`);
    await expect(page.getByText(new RegExp(TEMPORARY_STAGE_LABEL)).first()).toBeVisible({
      timeout: 15000,
    });
  } finally {
    // 4. 还原（API 直连，避免用例失败时残留临时展示名）
    await restoreStageLabel();
  }

  // 4b. 还原后前台回到原展示名（证明消费方跟随字典，而非一次性渲染）
  await page.goto(`${FRONTEND_BASE}/admin/projects/${projectId}`);
  await expect(page.getByText(new RegExp(TEMPORARY_STAGE_LABEL))).toHaveCount(0, {
    timeout: 15000,
  });
});

test("停用渠道条目 → 公开只读端点不再下发", async ({ page }) => {
  // 固定编码保证可重复执行（字典 API 只增不删，重复运行复用同一条目）
  const code = "e2e_pw_channel";

  const createRes = await api.ctx.post("/api/v1/admin/dicts/lead_attr_channel/items", {
    data: { code, label: "E2E Playwright 渠道" },
  });
  // 首次 201，后续运行 409（已存在）——两者都继续
  expect([201, 409]).toContain(createRes.status());

  const itemsRes = await api.ctx.get("/api/v1/admin/dicts/lead_attr_channel/items");
  const items = (await itemsRes.json()) as { id: string; code: string }[];
  const created = items.find((item) => item.code === code);
  expect(created).toBeTruthy();

  // 归一化为启用态（上次运行可能停在停用态）
  await api.ctx.put(`/api/v1/admin/dicts/lead_attr_channel/items/${created!.id}`, {
    data: { enabled: true },
  });

  // 公开端点可见
  const publicBefore = await api.ctx.get("/api/v1/public/dicts/lead_attr_channel");
  expect(publicBefore.ok()).toBeTruthy();
  const beforeCodes = ((await publicBefore.json()) as { items: { code: string }[] }).items.map(
    (item) => item.code,
  );
  expect(beforeCodes).toContain(code);

  // 页面停用该条目
  await page.goto(`${FRONTEND_BASE}/admin/settings/dicts`);
  await page.getByTestId("dict-group-lead_attr_channel").click();
  const row = page.getByTestId(`dict-row-${code}`);
  await expect(row).toBeVisible();
  await row.getByLabel(`启用-${code}`).click();
  await expect(page.getByText("已停用（历史单据展示不变）")).toBeVisible();

  // 公开端点不再下发（写入已使本次进程缓存失效）
  const publicAfter = await api.ctx.get("/api/v1/public/dicts/lead_attr_channel");
  const afterCodes = ((await publicAfter.json()) as { items: { code: string }[] }).items.map(
    (item) => item.code,
  );
  expect(afterCodes).not.toContain(code);

  // 注：字典 API 只增不删（产品口径 D6），本用例结束保留一条「停用」条目，
  // 对公开端点与前台展示均不可见；可重复执行不再新增行。
  expect(created!.id).toBeTruthy();
});
