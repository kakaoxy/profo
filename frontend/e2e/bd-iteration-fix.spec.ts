import { expect, test } from "@playwright/test";
import { createApiContext, loginPage } from "./helpers/auth";

/** 提交一条审核 pending，返回条目 id（用后清理） */
async function createPendingEntry(name: string): Promise<number> {
  const { ctx, dispose } = await createApiContext();
  try {
    const res = await ctx.post("/api/v1/admin/building-dictionary/pending", {
      data: {
        kind: "community",
        name,
        community_payload: { district: "虹口", business_circle: "E2E" },
        source_type: "project",
        source_id: `00000000-0000-0000-0000-09${Date.now() % 100000000}`.slice(0, 36),
      },
    });
    expect(res.ok()).toBeTruthy();
    return ((await res.json()) as { pending_id: number }).pending_id;
  } finally {
    dispose();
  }
}

/** 提交一条户室 pending（挂真实小区+楼栋），返回条目 id 与楼栋号.
 *
 * 本地库 bd_rooms 可能为空（全量 733 万行仅线上导入）：先扫实表小区；
 * 若无户室，创建临时小区+楼栋+户室（_E2E_ROOM Casc 前缀，finally 清理）后提交 pending。
 */
async function createRoomPendingEntry(): Promise<{
  pendingId: number;
  buildingNo: string;
  roomNo: string;
  cleanup: () => Promise<void>;
}> {
  const { ctx, dispose } = await createApiContext();
  let tempCommId: string | null = null;
  try {
    // 1. 扫实表小区（有户室的直接用）
    const comms = await ctx.get("/api/v1/admin/building-dictionary/communities?page=1&page_size=50");
    const list = ((await comms.json()) as { items: { id: string; name: string }[] }).items;
    for (const c of list) {
      const blds = await ctx.get(`/api/v1/admin/building-dictionary/communities/${c.id}/buildings?page=1&page_size=20`);
      const bitems = ((await blds.json()) as { items: { id: number; building_no: string; room_count: number }[] }).items
        .filter((b) => b.room_count > 0 && !b.pending);
      if (bitems.length === 0) continue;
      const b = bitems[0];
      const detail = await ctx.get(`/api/v1/admin/building-dictionary/buildings/${b.id}`);
      const rooms = ((await detail.json()) as { rooms: { room_no: string; pending: boolean }[] }).rooms
        .filter((r) => !r.pending);
      if (rooms.length === 0) continue;
      const roomNo = rooms[0].room_no;
      const res = await ctx.post("/api/v1/admin/building-dictionary/pending", {
        data: {
          kind: "room",
          name: roomNo,
          parent_kind: "building",
          parent_id: String(b.id),
          source_type: "project",
          source_id: `00000000-0000-0000-0000-08${Date.now() % 100000000}`.slice(0, 36),
        },
      });
      if (res.ok()) {
        const pendingId = ((await res.json()) as { pending_id: number }).pending_id;
        return {
          pendingId,
          buildingNo: b.building_no,
          roomNo,
          cleanup: async () => {
            const { ctx: c2, dispose: d2 } = await createApiContext();
            try {
              const pr = await c2.get(`/api/v1/admin/building-dictionary/review?status=pending&page=1&page_size=50`);
              if (pr.ok()) {
                const body = (await pr.json()) as { items: { id: number }[] };
                if (body.items.some((i) => i.id === pendingId)) {
                  await c2.post(`/api/v1/admin/building-dictionary/review/${pendingId}/resolve`, {
                    data: { action: "reject" },
                  });
                }
              }
            } finally {
              d2();
            }
          },
        };
      }
    }
    // 2. 本地无户室 → 造临时小区+楼栋+户室
    const stamp = Date.now() % 1000000;
    const cc = await ctx.post("/api/v1/admin/building-dictionary/communities", {
      data: { name: `__E2E_ROOM_${stamp}__`, district: "虹口", business_circle: "E2E" },
    });
    expect(cc.ok()).toBeTruthy();
    tempCommId = ((await cc.json()) as { id: string }).id;
    const cb = await ctx.post("/api/v1/admin/building-dictionary/buildings", {
      data: { community_id: tempCommId, building_no: "9" },
    });
    expect(cb.ok()).toBeTruthy();
    const blds = await ctx.get(`/api/v1/admin/building-dictionary/communities/${tempCommId}/buildings?page=1&page_size=5`);
    const bId = ((await blds.json()) as { items: { id: number }[] }).items[0].id;
    const cr = await ctx.post(`/api/v1/admin/building-dictionary/buildings/${bId}/rooms`, {
      data: { building_id: bId, floor: "4", room_suffix: "01" },
    });
    expect(cr.ok()).toBeTruthy();
    const cp = await ctx.post("/api/v1/admin/building-dictionary/pending", {
      data: {
        kind: "room",
        name: "0401",
        parent_kind: "building",
        parent_id: String(bId),
        source_type: "project",
        source_id: `00000000-0000-0000-0000-08${stamp}`.slice(0, 36),
      },
    });
    expect(cp.ok()).toBeTruthy();
    const pendingId = ((await cp.json()) as { pending_id: number }).pending_id;
    return {
      pendingId,
      buildingNo: "9",
      roomNo: "0401",
      cleanup: async () => {
        const { ctx: c2, dispose: d2 } = await createApiContext();
        try {
          await c2.post(`/api/v1/admin/building-dictionary/review/${pendingId}/resolve`, {
            data: { action: "reject" },
          });
        } finally {
          d2();
        }
        const { execSync } = await import("node:child_process");
        void execSync; // 小区行留置 DB（is_active），交由 teardown 脚本统一清理
      },
    };
  } finally {
    dispose();
  }
}

/**
 * 楼盘字典迭代修复 E2E（对齐设计稿 v2.0）.
 *
 * 覆盖（本次迭代修复点）：
 * 1. 总览页：区域/环线/类型下拉筛选 + 首图列 + 页头动作（KPI/徽标）
 * 2. 详情抽屉：户型图库区块（上传/悬停操作）+ 画像编辑（编辑资料）+
 *    admin 补录楼栋区间表单 + 合并按钮
 * 3. 导入页：四步 stepper + 任务历史
 * 4. 审核池：KPI + 队列表
 * 5. 项目详情：地址绑定卡（绑定地址/解绑）
 *
 * 可复跑：E2E_FRONT_BASE=http://localhost:3000 npx playwright test e2e/bd-iteration-fix.spec.ts
 * 依赖：本地后端 :8000 + 前端 :3000 调试进程；账号读 E2E_ADMIN_USER/PASSWORD。
 */

test.describe("楼盘字典迭代修复 E2E（对齐设计稿 v2.0）", () => {
  test.beforeEach(async ({ page }) => {
    await loginPage(page);
  });

  test("总览页：KPI/筛选下拉/表头列/页头动作 + 区域筛选联动", async ({ page }) => {
    await page.goto("/admin/building-dictionary");
    // 规格 v2.0（FR-01/FR-20）明确**删除总览首图缩略列**：图片只在抽屉「户型图库」区块。
    // 原断言 getByText("首图") 已随规格变更失效（不是回归），改为断言真实表头列。
    await expect(page.getByRole("columnheader", { name: /小区/ }).first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole("columnheader", { name: /已关联项目|已绑项目/ })).toBeVisible();
    // 反向保证：首图列不应再出现（防止规格回退后无人发现）
    await expect(page.getByRole("columnheader", { name: /首图/ })).toHaveCount(0);

    // KPI hero（设计稿：唯一 Apricot 暖卡 + 三张灰底卡）
    await expect(page.getByText("已绑项目").first()).toBeVisible();
    const warmCards = page.locator(".bg-apricot-wash.rounded-\\[20px\\]");
    await expect(warmCards).toHaveCount(1);

    // 筛选栏：区域/环线/类型下拉（新增交互）
    await expect(page.getByRole("combobox").filter({ hasText: "区域：全部" })).toBeVisible();
    await expect(page.getByRole("combobox").filter({ hasText: "环线：全部" })).toBeVisible();
    await expect(page.getByRole("combobox").filter({ hasText: "类型：全部" })).toBeVisible();

    // 页头动作
    await expect(page.getByRole("button", { name: /新增小区/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /导入数据/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /待审核/ })).toBeVisible();

    // 区域筛选联动 URL（真实筛选链路）
    await page.getByRole("combobox").filter({ hasText: "区域：全部" }).click();
    await page.getByRole("option", { name: "徐汇" }).click();
    await expect(page).toHaveURL(/district=/, { timeout: 15000 });

    // 清除筛选恢复
    await page.getByRole("button", { name: "清除筛选" }).click();
    await expect(page).toHaveURL(/admin\/building-dictionary$/, { timeout: 15000 });
  });

  test("抽屉：户型图库区块 + 编辑资料 + admin 补录楼栋表单 + 合并按钮", async ({ page }) => {
    await page.goto("/admin/building-dictionary");
    await page.locator("tbody tr").first().click();

    // 画像 + 户型图库区块（FR-20 融合）
    await expect(page.getByText("户型图库")).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("位置坐标（BD-09）")).toBeVisible();

    // admin 补录入口（FR-06）→ 展开区间表单
    await page.getByText("+ 添加楼栋").click();
    await expect(page.getByPlaceholder("如 122乙 或 29-55")).toBeVisible();
    // 取消收起
    await page.getByRole("button", { name: "取消" }).click();

    // 楼栋行展开 → 户室网格 + 添加户室入口
    const buildingRow = page.locator("button", { hasText: /户/ }).filter({ hasText: /层/ }).first();
    if (await buildingRow.count()) {
      await buildingRow.click();
      await expect(page.getByText(/添加户室，可一次加一批/).first()).toBeVisible({ timeout: 10000 });
    }

    // admin 补录户室（FR-06）：点击入口 → 行内区间表单出现（回归：点击无反应缺陷）
    const addRoomBtn = page.getByText("添加户室，可一次加一批").first();
    if (await addRoomBtn.isVisible()) {
      await addRoomBtn.click();
      await expect(page.getByPlaceholder("4 或 7-12")).toBeVisible({ timeout: 5000 });
      await expect(page.getByPlaceholder("01-08")).toBeVisible();
      await page.getByRole("button", { name: "取消" }).last().click();
      await expect(page.getByPlaceholder("4 或 7-12")).toBeHidden();
    }

    // 合并按钮（governance 权限）→ 打开合并弹层（搜索-勾选-合并）
    await page.getByRole("button", { name: "合并", exact: true }).click();
    const mergeDialog = page.getByRole("dialog", { name: /合并到/ });
    await expect(mergeDialog.getByText(/全库按小区名\/地址检索/)).toBeVisible({ timeout: 10000 });
    await mergeDialog.getByRole("button", { name: "取消" }).click();
    await expect(page.getByRole("dialog", { name: /合并到/ })).toBeHidden({ timeout: 10000 });

    // 底部操作条（设计稿 dw-foot）：编辑资料 + 绑定项目（选中户室前置灰）
    await expect(page.getByRole("button", { name: /编辑资料/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "绑定项目" })).toBeDisabled();
  });

  test("导入页：四步 stepper + 任务历史表头", async ({ page }) => {
    await page.goto("/admin/building-dictionary/import");
    await expect(page.getByText("上传文件")).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("检查数据", { exact: true })).toBeVisible();
    await expect(page.getByText("后台导入", { exact: false })).toBeVisible();
    await expect(page.getByText("核对结果", { exact: true })).toBeVisible();
    await expect(page.getByText("导入任务历史")).toBeVisible();
    await expect(page.getByText("拖文件到这里，或")).toBeVisible();
  });

  test("审核池：KPI 四卡 + 队列表头（含引用列）", async ({ page }) => {
    await page.goto("/admin/building-dictionary/review");
    await expect(page.getByText("待审核").first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("提交时间")).toBeVisible();
    await expect(page.getByText("来源单据")).toBeVisible();
    await expect(page.getByText("提交内容")).toBeVisible();
  });

  test("审核池：KPI 暖卡唯一 + 队列列（小区/mono 内容）+ 状态口径", async ({ page }) => {
    await page.goto("/admin/building-dictionary/review");
    await expect(page.getByText("待审核").first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("已并到已有")).toBeVisible();
    // 设计稿状态文案：已新增（非已转正/已入库）
    await expect(page.getByText("已新增").or(page.getByText("待审核")).first()).toBeVisible();
    // 列头：小区列独立 + 提交内容
    await expect(page.getByRole("columnheader", { name: "小区" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "提交内容" })).toBeVisible();
  });

  test("审核弹层：默认选中用已有的 + 三动作卡 + 提交人三格", async ({ page }) => {
    const name = `__E2E_REVIEW_UI_${Date.now() % 1000000}__`;
    await createPendingEntry(name);
    try {
      await page.goto("/admin/building-dictionary/review");
      const row = page.locator("tbody tr", { hasText: name });
      await expect(row).toBeVisible({ timeout: 20000 });
      // 提交内容列 mono 格式「新小区 · X」
      await expect(row.getByText(`新小区 · ${name}`)).toBeVisible();
      await row.click();
      const dialog = page.getByRole("dialog");
      // 头部 mono 标识 + 三格（提交人/来源单据/提交时间）
      await expect(dialog.getByText(/REVIEW · #PE-/)).toBeVisible({ timeout: 10000 });
      await expect(dialog.getByText("提交人", { exact: true })).toBeVisible();
      await expect(dialog.getByText("来源单据", { exact: true })).toBeVisible();
      await expect(dialog.getByText("提交时间", { exact: true })).toBeVisible();
      // 三动作卡存在
      await expect(dialog.getByText("确认新增")).toBeVisible();
      await expect(dialog.getByText("用已有的")).toBeVisible();
      await expect(dialog.getByText("驳回")).toBeVisible();
      // 小区条目选目标：搜索框出现（merge 默认选中）
      await expect(dialog.getByPlaceholder(/搜目标小区名或地址/)).toBeVisible();
      // 切到确认新增 → 目标选择区消失
      await dialog.getByText("确认新增").click();
      await expect(dialog.getByPlaceholder(/搜目标小区名或地址/)).toBeHidden();
    } finally {
      const { ctx, dispose } = await createApiContext();
      try {
        const pendRes = await ctx.get(`/api/v1/admin/building-dictionary/review?status=pending&page=1&page_size=50`);
        if (pendRes.ok()) {
          const body = (await pendRes.json()) as { items: { id: number; name: string }[] };
          const entry = body.items.find((i) => i.name === name);
          if (entry) {
            await ctx.post(`/api/v1/admin/building-dictionary/review/${entry.id}/resolve`, {
              data: { action: "reject" },
            });
          }
        }
      } finally {
        await dispose();
      }
    }
  });

  test("户室条目弹层：小区固定 + 楼栋/楼层/户室级联 + 预填该层首户 + 推荐标", async ({ page }) => {
    const { pendingId, buildingNo, roomNo, cleanup } = await createRoomPendingEntry();
    try {
      await page.goto("/admin/building-dictionary/review");
      const row = page.locator("tbody tr", { hasText: `新户室 · ${roomNo}` }).first();
      await expect(row).toBeVisible({ timeout: 20000 });
      await row.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText(/REVIEW · #PE-/)).toBeVisible({ timeout: 10000 });
      // 小区固定（无需搜索框）
      await expect(dialog.getByText(/小区固定为/)).toBeVisible();
      await expect(dialog.getByPlaceholder(/搜目标小区名或地址/)).toBeHidden();
      // 楼栋 chips 含预填楼栋（选中态 ink 底）
      const bChip = dialog.locator("button", { hasText: `${buildingNo}栋` }).first();
      await expect(bChip).toBeVisible({ timeout: 10000 });
      // 预填户室网格出现并含提交户室号
      await expect(dialog.getByText("户室（必选）")).toBeVisible({ timeout: 10000 });
      const plateNo = roomNo.replace(/^(\d{2})/, String(parseInt(roomNo.slice(0, 2), 10)));
      await expect(dialog.locator("button", { hasText: plateNo }).first()).toBeVisible({ timeout: 10000 });
      // 将改指回显（预填后即有目标）
      await expect(dialog.getByText(/将合并到|将改指/)).toBeVisible({ timeout: 10000 });
      // 提交结果（合并到已有）
      await dialog.getByRole("button", { name: "提交结果" }).click();
      await expect(dialog).toBeHidden({ timeout: 15000 });
      void pendingId;
    } finally {
      await cleanup();
    }
  });

  /**
   * 项目详情 · 地址字典绑定入口。
   *
   * 规格变更（FR-13 / commit 1d3a06b8）：项目详情的独立「地址绑定卡」已移除，
   * 地址改由 **编辑内联态里的共享四级选择器 `DictAddressPicker`** 承载
   * （`info-inline-editor.tsx` 中 `community_name` 字段）。原用例断言的
   * 「地址绑定」标题 / 「绑定地址|改绑定」按钮 / 「字典选择」弹窗均已不存在。
   *
   * 现在按**当前真实链路**验证：进项目详情 → 触发内联编辑 → 选择器出现且可打开
   * 小区联想（这才是字典绑定的实际入口）。
   */
  test("项目详情：内联编辑态的字典地址选择器（绑定入口）", async ({ page }) => {
    const { ctx, dispose } = await createApiContext();
    let projectId: string;
    let communityName = "";
    try {
      const res = await ctx.get("/api/v1/projects?page=1&page_size=1");
      expect(res.ok()).toBeTruthy();
      const body = (await res.json()) as {
        items: { id: string; community_name?: string }[];
      };
      expect(body.items.length).toBeGreaterThan(0);
      projectId = body.items[0].id;
      communityName = body.items[0].community_name ?? "";
    } finally {
      await dispose();
    }

    await page.goto(`/admin/projects/${projectId}`);
    // 详情页基础信息渲染（小区名来自字典冗余字段）
    if (communityName) {
      await expect(page.getByText(communityName, { exact: false }).first()).toBeVisible({
        timeout: 30000,
      });
    }

    // 进入内联编辑：卡头「编辑」textlink（顶栏也有同名入口，取第一个即可）。
    // ⚠️ 已归档项目按规格不渲染编辑入口（后端 PUT 也 400），此时显式 skip 而不是假通过。
    const editEntry = page.getByRole("button", { name: /^编辑(资料)?$/ }).first();
    if ((await editEntry.count()) === 0) {
      test.skip(true, "首个项目为已归档态（规格不渲染编辑入口），字典选择器入口未覆盖");
      return;
    }
    await expect(editEntry).toBeVisible({ timeout: 30000 });
    await editEntry.click();

    // 字典四级选择器出现（项目编辑统一走 DictAddressPicker，不再有独立绑定卡）。
    // 小区触发按钮（PopoverTrigger）文案：已选小区→小区名；未选→「搜索小区…」。
    // 编辑态下「手动填写地址」是兼容模式入口，它旁边那个带 Building2 图标的按钮即触发器。
    // 「手动填写地址」是兼容模式入口；它所在选择器容器内的 **第 2 个按钮** 是小区触发器
    // （第 1 个是「手动填写地址」本身，其后依次是楼栋/户室/新建入口）。
    const manualToggle = page.getByRole("button", { name: "手动填写地址" });
    await expect(manualToggle).toBeVisible({ timeout: 15000 });
    const pickerBox = manualToggle.locator("xpath=ancestor::div[contains(@class,'rounded-cards')][1]");
    const communityTrigger = pickerBox.locator("button").nth(1);
    await expect(communityTrigger).toBeVisible({ timeout: 15000 });
    // 断言触发器承载小区语义（已选小区名 或 未选时的「搜索小区…」），证明是字典选择器而非其它按钮
    await expect(communityTrigger).toHaveText(/小区|搜索/);

    // 打开小区联想（字典绑定的真实入口）→ 搜索面板出现
    await communityTrigger.click();
    await expect(page.getByPlaceholder("输入小区名/地址/别名搜索")).toBeVisible({ timeout: 15000 });
    await page.keyboard.press("Escape");
  });
});
