/**
 * 「评估工作台」列表页测试：epoch 竞态守卫、双接口并行渲染、
 * 搜索双段生效、触底「已处理优先、待评估兜底」分派、已处理卡语义映射.
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
  formatDate: () => "2026-01-01",
}));

beforeAll(async () => {
  await import("../../pages/valuation/evaluate/index");
});

type AnyRecord = Record<string, any>;

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function pendingItem(id: string) {
  return {
    id,
    community_name: `小区${id}`,
    district: "朝阳区",
    layout: "2室1厅",
    area: 90,
    floor_info: "高楼层/28层",
    orientation: "南北",
    remarks: null,
    expected_price: 300,
    images: [],
    source: "customer_share",
    created_at: "2026-01-01T00:00:00Z",
  };
}

function handledItem(id: string, status: string, evalPrice: number | null) {
  return {
    id,
    community_name: `已处理${id}`,
    district: "朝阳区",
    layout: null,
    area: 88,
    floor_info: "低楼层/15层",
    orientation: "东",
    expected_price: 280,
    images: [],
    source: "employee_entry",
    status,
    status_display: "—",
    eval_price: evalPrice,
    audit_time: "2026-01-01T00:00:00Z",
  };
}

function queueResponse(pending: unknown[], total: number) {
  return {
    items_pending: pending,
    pending_total: total,
    pending_today: 0,
    page: 1,
    page_size: 10,
  };
}

function handledResponse(items: unknown[], total: number) {
  return {
    items,
    handled_total: total,
    page: 1,
    page_size: 10,
  };
}

/** 取最近一次 reset 发出的双请求对：[pending-assessment, handled-assessment]. */
function lastResetPair() {
  const reqs = pendingReqs();
  const pair = reqs.slice(-2);
  expect(pair[0].opts.url).toBe("/public/leads/pending-assessment");
  expect(pair[1].opts.url).toBe("/public/leads/handled-assessment");
  return pair;
}

/** resolve 最近一次 reset 的双请求（并行 Promise.all 需双请求均 settle）. */
function resolveReset(pending: unknown[], pendingTotal: number, handled: unknown[], handledTotal: number) {
  const [pendingReq, handledReq] = lastResetPair();
  pendingReq.resolve(queueResponse(pending, pendingTotal));
  handledReq.resolve(handledResponse(handled, handledTotal));
}

beforeEach(() => {
  resetTestStubs();
});

describe("评估工作台 epoch 竞态守卫", () => {
  it("翻页在途时静默刷新：晚到的旧翻页响应被丢弃，仅待评估段追加不受污染", async () => {
    const ctx = createPageHarness({
      pendingItems: [{ id: "a" }],
      page: 1,
      pendingTotal: 3,
      noMore: false,
      handledItems: [],
      handledTotal: 0,
      handledNoMore: true,
    });

    ctx.onReachBottom();
    expect(pendingReqs()).toHaveLength(1);
    const [loadMore] = pendingReqs();
    expect(loadMore.opts.url).toBe("/public/leads/pending-assessment");
    expect(Number(loadMore.opts.data.page)).toBe(2);

    ctx.onShow();
    // reset 双接口并行：待评估 + 已处理
    expect(pendingReqs()).toHaveLength(3);
    const [silentReset, silentHandled] = lastResetPair();
    expect(Number(silentReset.opts.data.page)).toBe(1);

    silentReset.resolve(queueResponse([pendingItem("b"), pendingItem("c")], 2));
    silentHandled.resolve(handledResponse([], 0));
    await flush();
    expect(ctx.data.pendingItems.map((i: AnyRecord) => i.id)).toEqual(["b", "c"]);
    expect(ctx.data.page).toBe(1);

    loadMore.resolve(queueResponse([pendingItem("z")], 99));
    await flush();

    expect(ctx.data.pendingItems.map((i: AnyRecord) => i.id)).toEqual(["b", "c"]);
    expect(ctx.data.pendingTotal).toBe(2);
    expect(wxStubs.showToast).not.toHaveBeenCalled();
    expect(ctx.data.loadingMore).toBe(false);
  });

  it("当前代翻页失败回滚页码并提示", async () => {
    const ctx = createPageHarness({
      pendingItems: [{ id: "a" }],
      page: 1,
      pendingTotal: 3,
      noMore: false,
      handledNoMore: true,
    });

    ctx.onReachBottom();
    pendingReqs()[0].reject({ statusCode: 500 });
    await flush();

    expect(ctx.data.page).toBe(1);
    expect(ctx.data.noMore).toBe(false);
    expect(wxStubs.showToast).toHaveBeenCalledTimes(1);
  });
});

describe("评估工作台双接口渲染与语义映射", () => {
  it("reset 并行请求双接口，同时渲染待评估与已处理段", async () => {
    const ctx = createPageHarness({});

    ctx.onShow();
    resolveReset(
      [pendingItem("p1")],
      1,
      [handledItem("h1", "pending_visit", 350.5), handledItem("h2", "lost_to_competitor", null)],
      2,
    );
    await flush();

    expect(ctx.data.pendingItems).toHaveLength(1);
    expect(ctx.data.pendingTotal).toBe(1);
    expect(ctx.data.handledItems).toHaveLength(2);
    expect(ctx.data.handledTotal).toBe(2);
    expect(ctx.data.handledPage).toBe(1);
    // 已处理段首页即满：handledNoMore 置真
    expect(ctx.data.handledNoMore).toBe(true);
  });

  it("搜索确认时双接口均携带 search 参数（搜索双段生效）", async () => {
    const ctx = createPageHarness({});
    ctx.data.search = "通河八村";

    ctx.onSearchConfirm();
    const [pendingReq, handledReq] = lastResetPair();
    expect(String(pendingReq.opts.data.search)).toBe("通河八村");
    expect(String(handledReq.opts.data.search)).toBe("通河八村");

    resolveReset([], 0, [handledItem("h1", "pending_visit", 300)], 1);
    await flush();
    expect(ctx.data.pendingItems).toHaveLength(0);
    expect(ctx.data.handledItems).toHaveLength(1);
  });

  it("待评估卡参数行与来源语义映射", async () => {
    const ctx = createPageHarness({});
    ctx.onShow();
    resolveReset([pendingItem("p1")], 1, [], 0);
    await flush();

    const [card] = ctx.data.pendingItems;
    expect(card.l1).toBe("2室1厅 · 90㎡ · 高楼层/28层");
    expect(card.l2).toBe("朝阳区 · 南北");
    expect(card.priceValue).toBe("300");
    expect(card.priceUnit).toBe("万");
    expect(card.sourceText).toBe("客户分享");
    expect(card.sourceClass).toBe("share");
  });

  it("已处理卡语义：approve 展示授权价（绿），rejected/lost 报价 —，动作芯片对齐设计稿", async () => {
    const ctx = createPageHarness({});
    ctx.onShow();
    resolveReset(
      [],
      0,
      [
        handledItem("h1", "pending_visit", 350.5),
        handledItem("h2", "rejected", null),
        handledItem("h3", "lost_to_competitor", null),
      ],
      3,
    );
    await flush();

    const [approve, reject, lost] = ctx.data.handledItems;
    expect(approve.priceLabel).toBe("授权价");
    expect(approve.priceValue).toBe("350.5");
    expect(approve.priceUnit).toBe("万");
    expect(approve.priceOk).toBe(true);
    expect(approve.tagText).toBe("已授权");
    expect(approve.actionText).toBe("已授权 · 待看房");
    expect(approve.actionClass).toBe("ap");
    expect(reject.priceLabel).toBe("业主报价");
    expect(reject.priceValue).toBe("—");
    expect(reject.priceUnit).toBe("");
    expect(reject.priceOk).toBe(false);
    expect(reject.tagText).toBe("已驳回");
    expect(reject.actionText).toBe("已驳回");
    expect(reject.tagClass).toBe("gray");
    expect(lost.priceValue).toBe("—");
    expect(lost.tagText).toBe("他司成交");
    expect(lost.tagClass).toBe("rust");
    expect(lost.actionText).toBe("他司已成交 · 线索关闭");
    expect(lost.actionClass).toBe("lost");
    expect(lost.sourceText).toBe("员工直录");
    expect(lost.sourceClass).toBe("direct");
  });

  it("已处理卡语义：visited 展示已看房标签与授权价（可调整评估价）", async () => {
    const ctx = createPageHarness({});
    ctx.onShow();
    resolveReset([], 0, [handledItem("h1", "visited", 320)], 1);
    await flush();

    const [visited] = ctx.data.handledItems;
    expect(visited.tagText).toBe("已看房");
    expect(visited.tagClass).toBe("green");
    expect(visited.actionText).toBe("已看房 · 可调整评估价");
    expect(visited.actionClass).toBe("ap");
    expect(visited.priceLabel).toBe("授权价");
    expect(visited.priceValue).toBe("320");
    expect(visited.priceOk).toBe(true);
  });

  it("403 切无权限态并清空双段", async () => {
    const ctx = createPageHarness({ pendingItems: [{ id: "a" }] });
    ctx.onShow();
    const [pendingReq] = lastResetPair();
    pendingReq.reject({ statusCode: 403 });
    await flush();

    expect(ctx.data.forbidden).toBe(true);
    expect(ctx.data.pendingItems).toEqual([]);
    expect(ctx.data.handledItems).toEqual([]);
  });
});

describe("评估工作台触底加载分派", () => {
  // 工厂函数：harness 的索引路径 setData 会原地改写 seed 引用的数组，须每次新建避免用例间串扰
  const seedBothPaginated = () => ({
    pendingItems: [{ id: "a" }],
    page: 1,
    pendingTotal: 3,
    noMore: false,
    handledItems: [{ id: "h1" }],
    handledTotal: 2,
    handledPage: 1,
    handledLoadingMore: false,
    handledNoMore: false,
  });

  it("触底优先加载已处理段，追加后置 handledNoMore", async () => {
    const ctx = createPageHarness(seedBothPaginated());

    ctx.onReachBottom();
    expect(pendingReqs()).toHaveLength(1);
    const [handledMore] = pendingReqs();
    expect(handledMore.opts.url).toBe("/public/leads/handled-assessment");
    expect(Number(handledMore.opts.data.page)).toBe(2);

    handledMore.resolve(handledResponse([handledItem("h2", "visited", 320)], 2));
    await flush();
    expect(ctx.data.handledItems.map((i: AnyRecord) => i.id)).toEqual(["h1", "h2"]);
    expect(ctx.data.handledPage).toBe(2);
    expect(ctx.data.handledNoMore).toBe(true);

    // 已处理已满：下一次触底兜底加载待评估段
    ctx.onReachBottom();
    const [, pendingMore] = pendingReqs();
    expect(pendingMore.opts.url).toBe("/public/leads/pending-assessment");
    expect(Number(pendingMore.opts.data.page)).toBe(2);
  });

  it("已处理翻页失败回滚页码并提示", async () => {
    const ctx = createPageHarness(seedBothPaginated());

    ctx.onReachBottom();
    pendingReqs()[0].reject({ statusCode: 500 });
    await flush();

    expect(ctx.data.handledPage).toBe(1);
    expect(ctx.data.handledNoMore).toBe(false);
    expect(ctx.data.handledItems).toHaveLength(1);
    expect(wxStubs.showToast).toHaveBeenCalledTimes(1);
  });

  it("任一段加载中触底不重复触发", () => {
    const ctx = createPageHarness({ ...seedBothPaginated(), handledLoadingMore: true });

    ctx.onReachBottom();
    expect(pendingReqs()).toHaveLength(0);
  });

  it("已处理翻页在途时静默刷新：不残留 handledLoadingMore，触底仍可继续分派", async () => {
    const ctx = createPageHarness(seedBothPaginated());

    ctx.onReachBottom();
    const [handledMore] = pendingReqs();
    expect(handledMore.opts.url).toBe("/public/leads/handled-assessment");

    // 在途期间 onShow 静默刷新（授权返回等）：epoch 更替使旧代已处理翻页响应整体失效
    ctx.onShow();
    const [silentPending, silentHandled] = lastResetPair();
    silentPending.resolve(queueResponse([pendingItem("b")], 1));
    silentHandled.resolve(handledResponse([handledItem("h1", "visited", 300)], 2));
    await flush();

    // 旧代响应晚到：不得污染当前代数据
    handledMore.resolve(handledResponse([handledItem("h2", "visited", 320)], 2));
    await flush();
    expect(ctx.data.handledItems.map((i: AnyRecord) => i.id)).toEqual(["h1"]);

    // 残留的 handledLoadingMore 会永久拦截 onReachBottom，双段均无法继续翻页
    expect(ctx.data.handledLoadingMore).toBe(false);
    const before = pendingReqs().length;
    ctx.onReachBottom();
    expect(pendingReqs()).toHaveLength(before + 1);
  });
});

describe("评估工作台已处理卡跳转", () => {
  it("已处理卡点击进入只读详情页（mode=view）并透传原始项", () => {
    const ctx = createPageHarness({});
    const handled = handledItem("h1", "pending_visit", 350);
    ctx._handledById = { h1: handled };

    ctx.onHandledTap({ currentTarget: { dataset: { id: "h1" } } });

    expect(wxStubs.navigateTo).toHaveBeenCalledTimes(1);
    const [opts] = (wxStubs.navigateTo as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.url).toBe("/pages/valuation/authorize/index?id=h1&mode=view");
    const success = opts.success as (res: unknown) => void;
    const emit = vi.fn();
    success({ eventChannel: { emit } });
    expect(emit).toHaveBeenCalledWith("leadDetail", handled);
  });

  it("待评估卡点击进入授权页（无 mode 参数）", () => {
    const ctx = createPageHarness({});
    const raw = pendingItem("p1");
    ctx._rawById = { p1: raw };

    ctx.onItemTap({ currentTarget: { dataset: { id: "p1" } } });

    expect(wxStubs.navigateTo).toHaveBeenCalledTimes(1);
    const [opts] = (wxStubs.navigateTo as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.url).toBe("/pages/valuation/authorize/index?id=p1");
  });

  it("未知 id 不跳转", () => {
    const ctx = createPageHarness({});
    ctx.onHandledTap({ currentTarget: { dataset: { id: "ghost" } } });
    expect(wxStubs.navigateTo).not.toHaveBeenCalled();
  });
});
