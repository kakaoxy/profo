import { expect, test } from "@playwright/test";

import { createApiContext, loginPage } from "./helpers/auth";

/**
 * 审核池楼栋可达性回归（呼玛二村 285 号）.
 *
 * 背景：审核弹层原实现只拉小区楼栋第一页 100 条，呼玛二村有 279 栋，
 * 285 号按 id 排在第 190 条，审核员永远选不到；楼栋 chips 还错误地拼了「栋」。
 * 本用例通过真实 API 造一条 building pending，再从审核弹层的楼栋搜索框搜索
 * 285 并断言 chip 为「285号」，同时确认不再出现「285栋」。
 */
test.describe("审核池楼栋搜索", () => {
  test.beforeEach(async ({ page }) => {
    await loginPage(page);
  });

  test("呼玛二村 285 号可通过搜索选中，且量词显示为「号」", async ({ page }) => {
    const { ctx, dispose } = await createApiContext();
    let pendingId: number | null = null;

    try {
      const commRes = await ctx.get(
        "/api/v1/admin/building-dictionary/communities?keyword=呼玛二村&page=1&page_size=10",
      );
      expect(commRes.ok()).toBeTruthy();
      const communities = (await commRes.json()) as { items: { id: string; name: string }[] };
      const community = communities.items.find((item) => item.name === "呼玛二村");
      expect(community, "本地字典应存在呼玛二村").toBeTruthy();
      if (!community) return;

      // 先确认 285 号确实在字典里，且不在按 id 排序的第一页 100 条内。
      const allRes = await ctx.get(
        `/api/v1/admin/building-dictionary/communities/${community.id}/buildings?page=1&page_size=100`,
      );
      expect(allRes.ok()).toBeTruthy();
      const allPage = (await allRes.json()) as {
        total: number;
        items: { building_no: string }[];
      };
      expect(allPage.total).toBeGreaterThan(100);
      expect(allPage.items.some((item) => item.building_no === "285")).toBe(false);

      const searchRes = await ctx.get(
        `/api/v1/admin/building-dictionary/communities/${community.id}/buildings?keyword=285&page=1&page_size=100`,
      );
      expect(searchRes.ok()).toBeTruthy();
      const searchPage = (await searchRes.json()) as { items: { building_no: string }[] };
      expect(searchPage.items.some((item) => item.building_no === "285")).toBe(true);

      const name = `__E2E_BLD_${Date.now() % 1000000}__`;
      const createRes = await ctx.post("/api/v1/admin/building-dictionary/pending", {
        data: {
          kind: "building",
          name,
          parent_kind: "community",
          parent_id: community.id,
          source_type: "admin",
        },
      });
      expect(createRes.ok()).toBeTruthy();
      pendingId = ((await createRes.json()) as { pending_id: number }).pending_id;

      await page.goto("/admin/building-dictionary/review");
      const row = page.locator("tbody tr", { hasText: `新楼栋 · ${name}` }).first();
      await expect(row).toBeVisible({ timeout: 20000 });
      await row.click();

      const dialog = page.getByRole("dialog");
      await expect(dialog.getByText(/REVIEW · #PE-/)).toBeVisible({ timeout: 10000 });

      const search = dialog.getByLabel("搜索楼栋号");
      await expect(search).toBeVisible();
      await search.fill("285");
      await search.press("Enter");

      await expect(dialog.getByRole("button", { name: "285号" })).toBeVisible({
        timeout: 10000,
      });
      await expect(dialog.getByRole("button", { name: "285栋" })).toHaveCount(0);
    } finally {
      if (pendingId !== null) {
        await ctx.post(`/api/v1/admin/building-dictionary/review/${pendingId}/resolve`, {
          data: { action: "reject" },
        });
      }
      await dispose();
    }
  });
});
