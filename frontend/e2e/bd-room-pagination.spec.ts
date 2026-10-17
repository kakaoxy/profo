import { test, expect, type Page } from "@playwright/test";
import { getAdminToken, loginPage } from "./helpers/auth";

/**
 * P3 户室分页前端交互验证（2026-10-17 性能与安全专项审查）.
 *
 * 后端 `GET /admin/building-dictionary/buildings/{id}` 已由「一次返回整栋全部户室」
 * 改为 `room_page` / `room_page_size` 分页（默认 200、上限 500），响应携带
 * `room_total` / `room_has_more`。本用例在真实浏览器里验证**消费方**确实生效
 * （接线类修复必须验证消费方，AGENTS §3）：
 *
 * 1. 打开字典抽屉并展开库内最大楼栋（928 户 / 绿地望海新都 望园南路1518弄08）；
 * 2. 楼层面板显示「已显示 200 / 928 户」提示（证明前端读到了分页元信息）；
 * 3. 户室按钮数 ≤ 200（不是 928 —— 证明后端分页生效，前端未全量渲染）；
 * 4. 点「加载更多户室」后已显示数增加、分母（room_total）不变。
 *
 * 前置：后端 :8000 + 前端 :3000 运行中。
 * 命令：cd frontend && pnpm exec playwright test e2e/bd-room-pagination.spec.ts
 * 工件：e2e/.artifacts/bd-room-pagination-{before,after}.png
 */

const API_BASE = process.env.E2E_API_BASE ?? "http://127.0.0.1:8000";
/** 库内户室数最大的楼栋（实测 928 户，见审查报告 P3） */
const BIG_BUILDING_ID = 450040;
const BIG_COMMUNITY_NAME = "绿地望海新都（写字楼）";

interface BuildingDetail {
  room_total: number;
  room_has_more: boolean;
  rooms: { id: number; room_no: string; pending: boolean }[];
}

async function fetchDetail(page = 1, pageSize = 200): Promise<BuildingDetail> {
  const token = await getAdminToken();
  const res = await fetch(
    `${API_BASE}/api/v1/admin/building-dictionary/buildings/${BIG_BUILDING_ID}?room_page=${page}&room_page_size=${pageSize}`,
    { headers: { Authorization: `Bearer ${token}`, "X-Requested-With": "XMLHttpRequest" } },
  );
  expect(res.ok, `后端楼栋详情不可用: HTTP ${res.status}`).toBeTruthy();
  return (await res.json()) as BuildingDetail;
}

/** 打开总览 → 点小区行开抽屉 → 展开目标楼栋，返回抽屉与分页提示 */
async function openBigBuildingPanel(page: Page) {
  await page.goto(`/admin/building-dictionary?keyword=${encodeURIComponent(BIG_COMMUNITY_NAME)}`, {
    waitUntil: "domcontentloaded",
  });

  // 行点击开抽屉（表格行含小区名）
  const row = page.locator("tbody tr").filter({ hasText: BIG_COMMUNITY_NAME }).first();
  await row.waitFor({ state: "visible", timeout: 20000 });
  await row.click();

  const drawer = page.locator("[data-slot='sheet-content']");
  await drawer.waitFor({ state: "visible", timeout: 20000 });

  // 抽屉楼栋列表：点开「望园南路1518弄08」栋（928 户）
  const buildingRow = drawer.locator("button").filter({ hasText: "望园南路1518弄08" }).first();
  await buildingRow.waitFor({ state: "visible", timeout: 20000 });
  await buildingRow.click();

  const hint = drawer.getByText(/已显示 \d+ \/ \d+ 户/).first();
  await hint.waitFor({ state: "visible", timeout: 20000 });
  return { drawer, hint };
}

test.describe("P3 楼栋详情户室分页", () => {
  test("超大楼栋默认分页渲染 + 加载更多可用", async ({ page }) => {
    test.setTimeout(180_000);

    // 后端侧基线（先证明接口确实分页）
    const baseline = await fetchDetail(1, 200);
    expect(baseline.room_total).toBeGreaterThan(200);
    expect(baseline.room_has_more).toBe(true);
    expect(baseline.rooms.length).toBeLessThanOrEqual(200);

    await loginPage(page);
    await page.setViewportSize({ width: 1440, height: 1000 });

    const { drawer, hint } = await openBigBuildingPanel(page);

    // 1. 分页提示：分母 = 后端 room_total，已显示 = 200
    const hintText = (await hint.textContent()) ?? "";
    expect(hintText).toMatch(/已显示 200 \/ \d+ 户/);
    expect(hintText).toContain(`/ ${baseline.room_total} 户`);

    // 2. 户室按钮数 ≤ 200（不是 928）
    const roomButtons = drawer.locator("button").filter({ hasText: /^\d{3,4}$/ });
    const before = await roomButtons.count();
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThanOrEqual(200);

    await page.screenshot({ path: "e2e/.artifacts/bd-room-pagination-before.png" });

    // 3. 点「加载更多户室」→ 已显示数增加、分母不变
    await drawer.getByRole("button", { name: "加载更多户室" }).click();
    await expect
      .poll(async () => ((await hint.textContent()) ?? "").match(/已显示 (\d+) \//)?.[1], {
        timeout: 30000,
      })
      .not.toBe("200");

    const afterText = (await hint.textContent()) ?? "";
    const after = afterText.match(/已显示 (\d+) \/ (\d+) 户/);
    expect(after).not.toBeNull();
    expect(Number(after![1])).toBeGreaterThan(200);
    expect(Number(after![2])).toBe(baseline.room_total);

    // 4. 第 2 页数据确实进了 DOM：展开全部楼层后，户室按钮总数应 > 首屏
    //    （首屏只展开前 2 层，故用「全部展开」消除折叠带来的计数噪音）
    const floorButtons = drawer.locator("button").filter({ hasText: /\d+ 层/ });
    const floorCount = await floorButtons.count();
    for (let i = 0; i < floorCount; i++) {
      await floorButtons
        .nth(i)
        .click()
        .catch(() => {});
    }
    await expect.poll(async () => roomButtons.count(), { timeout: 30000 }).toBeGreaterThan(before);

    await page.screenshot({ path: "e2e/.artifacts/bd-room-pagination-after.png" });
  });
});
