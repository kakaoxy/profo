import { expect, Page } from "@playwright/test";

/**
 * 门店表单区域/商圈填选助手（迭代 1 REQ-IT1-04 之后）。
 *
 * 迭代 1 起后台门店表单不再有省/市，区域改为系统区域列表选择、商圈在该区域
 * 有系统候选时同样为列表选择（无候选时退回手填）。本助手按当前实现填选：
 * 区域取列表第一项；商圈在候选存在时选第一项，否则手填 fallbackCircle。
 */
export async function pickStoreRegion(page: Page, fallbackCircle = "南京东路商圈"): Promise<void> {
  // 区域切换会触发 /business-circles?district= 拉取，先挂监听避免竞态
  const circlesLoaded = page.waitForResponse((res) => res.url().includes("/business-circles?district="));

  await page.getByRole("combobox", { name: "区域", exact: true }).click();
  const district = (await page.getByRole("option").first().textContent())?.trim() ?? "";
  expect(district, "区域列表为空，无法选择区域").not.toBe("");
  await page.getByRole("option", { name: district, exact: true }).click();
  await expect(page.getByRole("combobox", { name: "区域", exact: true })).toContainText(district);

  await circlesLoaded.catch(() => undefined);

  const circleSelect = page.getByRole("combobox", { name: "商圈", exact: true });
  if ((await circleSelect.count()) > 0) {
    await circleSelect.click();
    await page.getByRole("option").first().click();
    return;
  }
  await page.getByLabel("商圈").fill(fallbackCircle);
}
