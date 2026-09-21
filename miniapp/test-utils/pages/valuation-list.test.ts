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
vi.mock("../../utils/url", () => ({
  resolveImageUrl: vi.fn((u: string) => u || ""),
}));
vi.mock("../../utils/valuation-display", () => ({
  statusTagClass: (status: string) =>
    (
      {
        pending_assessment: "amber",
        pending_visit: "green",
        visited: "green",
        signed: "ink",
        rejected: "gray",
        lost_to_competitor: "rust",
      } as Record<string, string>
    )[status] ?? "gray",
}));
// 时效纯函数 mock：基准 "stale" → over，其余 → ok（窗口判断保持真实口径）
vi.mock("../../utils/valuation-freshness", () => ({
  FRESHNESS_LABELS: { ok: "跟进中", soon: "即将过期", over: "已过期" },
  freshnessLevel: (baseline: string | null) => (baseline === "stale" ? "over" : baseline ? "ok" : null),
  isFreshnessWindow: (status: string) => status === "pending_visit" || status === "visited",
  cardTimeLabel: ({ status }: { status: string }) => {
    if (status === "pending_visit" || status === "visited") {
      return { prefix: "跟进", text: "01-01" };
    }
    if (status === "signed" || status === "rejected" || status === "lost_to_competitor") {
      return { prefix: "处理", text: "01-01" };
    }
    return { prefix: "提交", text: "01-01" };
  },
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
    floor_info: "高楼层/28层",
    district: "朝阳区",
    orientation: "南北",
    expected_price: 300,
    eval_price: null as number | null,
    image_thumbnails: ["/static/uploads/t.webp"] as string[] | null,
    last_follow_up_at: "2026-01-05T00:00:00Z" as string | null,
    audit_time: "2026-01-01T00:00:00Z" as string | null,
    created_at: "2026-01-01T00:00:00Z",
    status: "pending_visit" as string,
    status_display: "待看房",
    status_color: "#2196F3",
  };
}

function listResponse(items: unknown[], total: number) {
  return { items, total, page: 1, page_size: items.length || 10 };
}

beforeEach(() => {
  resetTestStubs();
});

describe("我的评估列表卡 toDisplay 结构", () => {
  it("已授权线索：lcard 槽位齐全（缩略图/两行参数/价格栈/时间/时效标签）", async () => {
    const ctx = createPageHarness({});
    ctx.onShow();
    pendingReqs()[0].resolve(listResponse([leadItem("a")], 1));
    await flush();

    const [card] = ctx.data.items;
    expect(card.name).toBe("小区a");
    expect(card.tagText).toBe("待看房");
    expect(card.tagClass).toBe("green");
    expect(card.image).toBe("/static/uploads/t.webp");
    expect(card.l1).toBe("2室1厅 · 90㎡ · 高楼层/28层");
    expect(card.l2).toBe("朝阳区 · 南北");
    // 未出评估价：价格栈回退业主报价（墨）
    expect(card.priceLabel).toBe("业主报价");
    expect(card.priceValue).toBe("300");
    expect(card.priceUnit).toBe("万");
    expect(card.priceOk).toBe(false);
    // 底左时间（跟进前缀，与时效标签同源）+ 底右时效标签
    expect(card.timeText).toBe("跟进 01-01");
    expect(card.freshText).toBe("跟进中");
    expect(card.freshClass).toBe("ok");
  });

  it("已出评估价：价格栈切「评估价」（绿）", async () => {
    const ctx = createPageHarness({});
    ctx.onShow();
    const item = leadItem("a");
    item.eval_price = 350;
    pendingReqs()[0].resolve(listResponse([item], 1));
    await flush();

    const [card] = ctx.data.items;
    expect(card.priceLabel).toBe("评估价");
    expect(card.priceValue).toBe("350");
    expect(card.priceOk).toBe(true);
  });

  it("待评估卡：时效标签留空，时间取「提交」前缀", async () => {
    const ctx = createPageHarness({});
    ctx.onShow();
    const item = leadItem("a");
    item.status = "pending_assessment";
    item.status_display = "待评估";
    item.image_thumbnails = null;
    item.last_follow_up_at = null;
    item.audit_time = null;
    pendingReqs()[0].resolve(listResponse([item], 1));
    await flush();

    const [card] = ctx.data.items;
    expect(card.tagClass).toBe("amber");
    expect(card.image).toBe("");
    expect(card.timeText).toBe("提交 01-01");
    expect(card.freshText).toBe("");
    expect(card.freshClass).toBe("");
  });

  it("已签约卡：ink 实底档，终态右下角留空、时间「处理」前缀", async () => {
    const ctx = createPageHarness({});
    ctx.onShow();
    const item = leadItem("a");
    item.status = "signed";
    item.status_display = "已签约";
    pendingReqs()[0].resolve(listResponse([item], 1));
    await flush();

    const [card] = ctx.data.items;
    expect(card.tagClass).toBe("ink");
    expect(card.timeText).toBe("处理 01-01");
    expect(card.freshClass).toBe("");
  });

  it("跟进超期（stale 基准）：时效标签切已过期（over）", async () => {
    const ctx = createPageHarness({});
    ctx.onShow();
    const item = leadItem("a");
    item.last_follow_up_at = "stale";
    pendingReqs()[0].resolve(listResponse([item], 1));
    await flush();

    expect(ctx.data.items[0].freshText).toBe("已过期");
    expect(ctx.data.items[0].freshClass).toBe("over");
  });
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
