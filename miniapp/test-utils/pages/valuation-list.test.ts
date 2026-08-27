/**
 * 「我的评估」列表页竞态测试：epoch 守卫保证「onShow 静默刷新/下拉刷新 reset 后，
 * 在途旧代翻页请求的响应（成功或鉴权失败）不会污染新一代列表与登录态」。
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
vi.mock("../../utils/token", () => ({
  getAccessToken: vi.fn(() => "admin-tok"),
  getCAccessToken: vi.fn(() => "c-tok"),
}));
vi.mock("../../utils/valuation-display", () => ({
  formatDate: () => "2026-01-01",
  statusBadgeStyle: () => ({ color: "#0369a1", background: "#e0f2fe" }),
}));

beforeAll(async () => {
  await import("../../pages/valuation/list/index");
});

type AnyRecord = Record<string, any>;

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function leadItem(id: string) {
  return {
    id,
    community_name: `小区${id}`,
    layout: "2室1厅",
    area: 90,
    created_at: "2026-01-01T00:00:00Z",
    status_color: "blue",
    status_display: "评估中",
  };
}

function listResponse(items: unknown[], total: number) {
  return { items, total, page: 1, page_size: items.length || 10 };
}

beforeEach(() => {
  resetTestStubs();
});

describe("我的评估列表 epoch 竞态守卫", () => {
  it("翻页在途时 onShow 静默刷新：晚到的旧翻页响应被丢弃", async () => {
    const ctx = createPageHarness({
      items: [{ id: "a" }],
      page: 1,
      total: 3,
      noMore: false,
    });

    ctx.onReachBottom();
    expect(pendingReqs()).toHaveLength(1);
    const [loadMore] = pendingReqs();
    expect(loadMore.opts.url).toBe("/public/leads/mine");
    expect(Number(loadMore.opts.data.page)).toBe(2);

    // 从估价提交页返回触发 onShow → 已有数据走静默刷新（reset，page=1）
    ctx.onShow();
    expect(pendingReqs()).toHaveLength(2);
    const [, silentReset] = pendingReqs();
    expect(Number(silentReset.opts.data.page)).toBe(1);

    silentReset.resolve(listResponse([leadItem("b"), leadItem("c")], 2));
    await flush();
    expect(ctx.data.items.map((i: AnyRecord) => i.id)).toEqual(["b", "c"]);
    expect(ctx.data.page).toBe(1);

    loadMore.resolve(listResponse([leadItem("z")], 99));
    await flush();

    expect(ctx.data.items.map((i: AnyRecord) => i.id)).toEqual(["b", "c"]);
    expect(ctx.data.total).toBe(2);
    expect(ctx.data.page).toBe(1);
    expect(wxStubs.showToast).not.toHaveBeenCalled();
    expect(ctx.data.loading).toBe(false);
    expect(ctx.data.loadingMore).toBe(false);
  });

  it("过期请求返回 401 不清 token、不切内部限定态", async () => {
    const ctx = createPageHarness({
      items: [{ id: "a" }],
      page: 1,
      total: 3,
      noMore: false,
    });

    ctx.onReachBottom();
    const [loadMore] = pendingReqs();
    ctx.onShow();
    const [, silentReset] = pendingReqs();

    silentReset.resolve(listResponse([leadItem("b"), leadItem("c")], 2));
    await flush();

    // 旧代翻页晚到且鉴权失败：不得误判登录失效（无守卫时会清 token / 切限定态）
    loadMore.reject({ statusCode: 401 });
    await flush();

    expect(wxStubs.removeStorageSync).not.toHaveBeenCalled();
    expect(ctx.data.internalOnly).toBe(false);
    expect(ctx.data.needLogin).toBe(false);
    expect(ctx.data.items.map((i: AnyRecord) => i.id)).toEqual(["b", "c"]);
    expect(wxStubs.showToast).not.toHaveBeenCalled();
    expect(ctx.data.loadingMore).toBe(false);
  });

  it("当前代翻页失败仍正常回滚页码并提示（守卫不误伤）", async () => {
    const ctx = createPageHarness({
      items: [{ id: "a" }],
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

  it("当前代静默刷新失败保留旧数据并恢复加载标志", async () => {
    const ctx = createPageHarness({
      items: [{ id: "a" }],
      loadingMore: true,
    });

    // 不先 await：onPullDownRefresh 内部要等请求 settle
    const refreshing = ctx.onPullDownRefresh();
    expect(pendingReqs()).toHaveLength(1);
    expect(Number(pendingReqs()[0].opts.data.page)).toBe(1);

    pendingReqs()[0].reject({ statusCode: 500 });
    await refreshing;

    // silent 失败不清空列表；stopPullDownRefresh 在 loadList 结束后才调用
    expect(ctx.data.items).toEqual([{ id: "a" }]);
    expect(ctx.data.loadingMore).toBe(false);
    expect(wxStubs.stopPullDownRefresh).toHaveBeenCalled();
  });
});
