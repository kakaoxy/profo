/**
 * 房源列表页 SWR 缓存竞态测试：缓存命中后的静默刷新（reset）与触底翻页并发时，
 * 晚到的第 1 页刷新响应不得覆盖已拼接的列表——否则列表被截断回第 1 页而页码停在 2，
 * 下次触底将从第 3 页续拉，第 2 页房源被永久跳过。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPageHarness,
  createRequestMock,
  pendingReqs,
  resetTestStubs,
} from "../test-harness";

/** SWR 缓存内容（getCacheData 的 mock 返回值），测试中按用例写入. */
const cacheStore = vi.hoisted(() => ({ data: undefined as unknown }));

vi.mock("../../utils/request", () => ({
  ...createRequestMock(),
  getCacheData: () => cacheStore.data,
}));
vi.mock("../../utils/url", () => ({
  resolveImageUrl: (u: string | null | undefined) => u ?? "",
  decodeQueryParam: (v: string | undefined) => v ?? "",
}));

beforeAll(async () => {
  await import("../../pages/properties/list/index");
});

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function ids(start: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => start + i);
}

function propItem(id: number) {
  return {
    id,
    community_name: `小区${id}`,
    status: "在售",
    rooms: 3,
    baths: 1,
    orientation: "南",
    floor_display: "中楼层",
    build_area: 89,
    total_price: 500,
    unit_price: 56000,
    district: "朝阳",
    business_circle: "望京",
    sold_date: null,
    listed_date: null,
    listing_remarks: "",
    data_source: "其他",
    picture_links: null,
  };
}

function listResponse(ids_: number[], total: number) {
  return { items: ids_.map(propItem), total, page: 1, page_size: ids_.length };
}

beforeEach(() => {
  resetTestStubs();
  cacheStore.data = undefined;
});

describe("房源列表 SWR 缓存竞态守卫", () => {
  it("缓存命中后静默刷新晚于翻页返回：不截断已拼接的列表", async () => {
    // 第一次进入：缓存未命中，正常拉取第 1 页（20 条，共 40 条）
    const first = createPageHarness();
    first.onLoad({});
    expect(pendingReqs()).toHaveLength(1);
    pendingReqs()[0].resolve(listResponse(ids(0, 20), 40));
    await flush();
    expect(first.data.items).toHaveLength(20);
    expect(first.data.page).toBe(1);

    // 响应已进 SWR 缓存；60s 内再次进入 → 命中缓存先渲染，随后静默刷新在途
    cacheStore.data = listResponse(ids(0, 20), 40);
    const ctx = createPageHarness();
    ctx.onLoad({});
    expect(ctx.data.items).toHaveLength(20);
    expect(pendingReqs()).toHaveLength(2);

    // 用户在刷新返回前触底 → 拉第 2 页
    ctx.onReachBottom();
    expect(ctx.data.page).toBe(2);
    expect(pendingReqs()).toHaveLength(3);

    // 第 2 页先返回，拼接成功（共 40 条）
    pendingReqs()[2].resolve(listResponse(ids(20, 20), 40));
    await flush();
    expect(ctx.data.items).toHaveLength(40);

    // 静默刷新（第 1 页新数据）晚到：不得把列表截断回第 1 页
    pendingReqs()[1].resolve(listResponse(ids(100, 20), 40));
    await flush();
    expect(ctx.data.items).toHaveLength(40);
    expect(ctx.data.items[0].id).toBe(0);
    expect(ctx.data.items[39].id).toBe(39);
    expect(ctx.data.loadingMore).toBe(false);
  });

  it("缓存命中后静默刷新先于翻页返回：正常覆盖为新数据，随后翻页追加", async () => {
    cacheStore.data = listResponse(ids(0, 20), 40);
    const ctx = createPageHarness();
    ctx.onLoad({});
    expect(pendingReqs()).toHaveLength(1);

    // 刷新先返回：覆盖缓存渲染
    pendingReqs()[0].resolve(listResponse(ids(50, 20), 40));
    await flush();
    expect(ctx.data.items).toHaveLength(20);
    expect(ctx.data.items[0].id).toBe(50);

    // 翻页正常追加在第 1 页新数据之后
    ctx.onReachBottom();
    pendingReqs()[1].resolve(listResponse(ids(20, 20), 40));
    await flush();
    expect(ctx.data.items.map((i: { id: number }) => i.id)).toEqual([
      ...ids(50, 20),
      ...ids(20, 20),
    ]);
  });

  it("被跳过的静默刷新不清除在途翻页的 loadingMore（防乱序续拉）", async () => {
    cacheStore.data = listResponse(ids(0, 20), 40);
    const ctx = createPageHarness();
    ctx.onLoad({});
    ctx.onReachBottom();
    expect(ctx.data.page).toBe(2);
    expect(ctx.data.loadingMore).toBe(true);

    // 刷新先返回：页码已在 2，items 不覆盖，loadingMore 保持在途标志
    pendingReqs()[0].resolve(listResponse(ids(50, 20), 40));
    await flush();
    expect(ctx.data.items).toHaveLength(20);
    expect(ctx.data.items[0].id).toBe(0);
    expect(ctx.data.loadingMore).toBe(true);

    // 翻页返回后由其自身 finally 恢复标志
    pendingReqs()[1].resolve(listResponse(ids(20, 20), 40));
    await flush();
    expect(ctx.data.items).toHaveLength(40);
    expect(ctx.data.loadingMore).toBe(false);
  });

  it("缓存命中后静默刷新失败：保留缓存内容静默降级，不出错误屏", async () => {
    cacheStore.data = listResponse(ids(0, 20), 40);
    const ctx = createPageHarness();
    ctx.onLoad({});
    pendingReqs()[0].reject({ statusCode: 500 });
    await flush();
    expect(ctx.data.items).toHaveLength(20);
    expect(ctx.data.error).toBe(false);
  });
});
