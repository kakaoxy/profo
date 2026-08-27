/**
 * 在售列表页竞态测试：epoch 守卫保证「切 tab/筛选 reset 后，
 * 在途旧代翻页请求的响应（成功或失败）不会污染新一代列表状态」。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPageHarness,
  createRequestMock,
  pendingReqs,
  resetTestStubs,
  wxStubs,
} from "../test-harness";

vi.mock("../../utils/request", () => createRequestMock());
vi.mock("../../utils/url", () => ({
  resolveImageUrl: (u: string | null | undefined) => u ?? "",
}));
vi.mock("../../utils/served-count", () => ({
  animateServedCount: vi.fn(),
  clearServedCountTimer: vi.fn(),
  loadServedCount: vi.fn(),
}));

beforeAll(async () => {
  await import("../../pages/projects/list/index");
});

type AnyRecord = Record<string, any>;

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function saleItem(id: number, status = "在售") {
  return {
    id,
    title: `t${id}`,
    community_name: "测试小区",
    layout: "2室1厅",
    orientation: "南",
    floor_info: "5层",
    area: 90,
    total_price: 100,
    cover_thumbnail_url: null,
    cover_image: null,
    tags: [],
    project_status: status,
  };
}

function soldItem(id: number) {
  return {
    id,
    title: `s${id}`,
    community_name: "测试小区",
    layout: "2室1厅",
    area: 88,
    total_price: 95,
    cover_thumbnail_url: null,
    cover_image: null,
  };
}

function listResponse(items: unknown[], total: number) {
  return { items, total, page: 1, page_size: items.length || 10 };
}

beforeEach(() => {
  resetTestStubs();
});

describe("在售列表 epoch 竞态守卫", () => {
  it("翻页在途时切换 tab：晚到的旧响应被丢弃，不污染新 tab 列表", async () => {
    const ctx = createPageHarness({
      tab: "all",
      items: [{ id: 1, badgeText: "" }],
      page: 1,
      total: 3,
      noMore: false,
    });

    ctx.onReachBottom();
    expect(pendingReqs()).toHaveLength(1);
    const [loadMore] = pendingReqs();
    expect(loadMore.opts.url).toBe("/public/projects");
    expect(Number(loadMore.opts.data.page)).toBe(2);

    ctx.switchToTab("sold");
    expect(ctx.data.tab).toBe("sold");
    expect(pendingReqs()).toHaveLength(2);
    const [, soldReset] = pendingReqs();
    expect(soldReset.opts.url).toBe("/public/projects/sold");

    soldReset.resolve(listResponse([soldItem(9)], 1));
    await flush();
    expect(ctx.data.items.map((i: AnyRecord) => i.id)).toEqual([9]);
    expect(ctx.data.total).toBe(1);
    expect(ctx.data.noMore).toBe(true);

    loadMore.resolve(listResponse([saleItem(2), saleItem(3)], 3));
    await flush();

    expect(ctx.data.tab).toBe("sold");
    expect(ctx.data.items.map((i: AnyRecord) => i.id)).toEqual([9]);
    expect(ctx.data.total).toBe(1);
    expect(wxStubs.showToast).not.toHaveBeenCalled();
    expect(ctx.data.loading).toBe(false);
    expect(ctx.data.loadingMore).toBe(false);
  });

  it("旧代翻页请求失败同样被静默丢弃", async () => {
    const ctx = createPageHarness({
      tab: "all",
      items: [{ id: 1, badgeText: "" }],
      page: 1,
      total: 3,
      noMore: false,
    });
    ctx.onReachBottom();
    const [loadMore] = pendingReqs();
    ctx.switchToTab("sold");
    const [, soldReset] = pendingReqs();

    soldReset.resolve(listResponse([soldItem(9)], 1));
    await flush();

    loadMore.reject({ errMsg: "request:fail" });
    await flush();

    expect(ctx.data.page).toBe(1);
    expect(ctx.data.error).toBe(false);
    expect(ctx.data.items.map((i: AnyRecord) => i.id)).toEqual([9]);
    expect(wxStubs.showToast).not.toHaveBeenCalled();
    expect(ctx.data.loadingMore).toBe(false);
  });

  it("当前代翻页失败仍正常回滚页码并提示（守卫不误伤）", async () => {
    const ctx = createPageHarness({
      tab: "all",
      items: [{ id: 1, badgeText: "" }],
      page: 1,
      total: 3,
      noMore: false,
    });
    ctx.onReachBottom();
    expect(pendingReqs()[0].opts.data.page).toBe(2);

    pendingReqs()[0].reject({ statusCode: 500 });
    await flush();

    expect(ctx.data.page).toBe(1);
    expect(ctx.data.noMore).toBe(false);
    expect(ctx.data.loadingMore).toBe(false);
    expect(wxStubs.showToast).toHaveBeenCalledTimes(1);
  });

  it("当前代正常翻页回归：响应按序追加", async () => {
    const ctx = createPageHarness({
      tab: "all",
      items: [{ id: 1, badgeText: "" }],
      page: 1,
      total: 3,
      noMore: false,
    });
    ctx.onReachBottom();
    pendingReqs()[0].resolve(listResponse([{ ...saleItem(2), project_status: "在途" }], 3));
    await flush();

    expect(ctx.data.items.map((i: AnyRecord) => i.id)).toEqual([1, 2]);
    expect(ctx.data.page).toBe(2);
    expect(ctx.data.noMore).toBe(false);
  });
});
