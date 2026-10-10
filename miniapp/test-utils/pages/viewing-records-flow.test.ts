/**
 * 带看记录明细页回归测试（设计稿 docs/2026-10-10 ARTBOARD 03 的 E2E 验证点）.
 *
 * 覆盖：
 * - 取数：onShow → GET /projects/sales-records?page=1&page_size=20（全部类型不传
 *   record_type）；类型筛选切换带 record_type 重拉；无令牌切 needLogin 不发请求
 * - 展示映射：一句话正文「{操作人} 为 {项目名} 添加一条{类型}记录」、日期 YYYY-MM-DD、
 *   出价行金额「出价金额：N万」（非法/非正价不出行）、带看/面谈无金额行、
 *   操作人缺失兜底「—」
 * - 状态机：empty（total=0）/ error / needLogin（401 清令牌）/ noPermission（403）
 * - 触底分页：hasMore 时 onReachBottom 拉下一页追加；loadingMore 防抖
 * - 渲染接线（wxml/wxss）：类型 chips 绑定 onFilterTap、rec-card 列表、状态分支
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import recordsWxml from "../../pages/viewing/records/index/index.wxml?raw";
import recordsWxss from "../../pages/viewing/records/index/index.wxss?raw";
import {
  createPageHarness,
  createRequestMock,
  pendingReqs,
  resetTestStubs,
  wxStubs,
} from "../test-harness";

const mockGetAccessToken = vi.fn(() => "tok");
vi.mock("../../utils/request", () => createRequestMock());
vi.mock("../../utils/token", () => ({
  getAccessToken: () => mockGetAccessToken(),
}));

beforeAll(async () => {
  await import("../../pages/viewing/records/index/index");
});

afterEach(() => {
  resetTestStubs();
});

afterAll(() => {
  vi.resetModules();
});

type AnyRecord = Record<string, any>;

/** 后端明细流条目（字段名与 SalesRecordFlowItem 对齐）. */
function flowItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: overrides.id ?? `r-${Math.random().toString(36).slice(2, 8)}`,
    record_type: "viewing",
    record_date: "2026-10-09T10:00:00+08:00",
    price: null,
    related_agent: null,
    operator_name: "唐",
    project_id: "p1",
    project_name: "金杨七街坊18号502",
    ...overrides,
  };
}

function flowResp(items: Record<string, unknown>[], total = items.length, page = 1, page_size = 20) {
  return { items, total, page, page_size };
}

function newPage(seed: AnyRecord = {}): AnyRecord {
  return createPageHarness({
    state: "loading",
    filters: [
      { key: "all", label: "全部" },
      { key: "viewing", label: "带看" },
      { key: "offer", label: "出价" },
      { key: "negotiation", label: "面谈" },
    ],
    activeFilter: "all",
    items: [],
    page: 1,
    total: 0,
    hasMore: false,
    loadingMore: false,
    ...seed,
  });
}

describe("明细页取数与展示映射", () => {
  it("onShow 拉取 /projects/sales-records（全部类型不传 record_type）", () => {
    const ctx = newPage();
    void ctx.onShow();
    const urls = pendingReqs().map((r) => r.opts.url);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("/projects/sales-records?page=1&page_size=20");
    expect(urls[0]).not.toContain("record_type=");
  });

  it("出价记录映射：正文一句话 + 日期 + 金额行；带看记录无金额行", async () => {
    const ctx = newPage();
    void ctx.onShow();
    pendingReqs()[0].resolve(
      flowResp([
        flowItem({ record_type: "offer", price: 460, record_date: "2026-10-09T10:00:00+08:00" }),
        flowItem({ id: "r2", record_type: "viewing", operator_name: "乐之", project_name: "泗塘三村61号401" }),
      ]),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.data.state).toBe("items");
    const items = ctx.data.items as AnyRecord[];
    expect(items[0].text).toBe("唐 为 金杨七街坊18号502 添加一条出价记录");
    expect(items[0].priceText).toBe("出价金额：460万");
    expect(items[0].dateText).toBe("2026-10-09");
    expect(items[0].typeLabel).toBe("出价");
    expect(items[1].text).toBe("乐之 为 泗塘三村61号401 添加一条带看记录");
    expect(items[1].priceText).toBe("");
  });

  it("操作人缺失兜底「—」；非法/非正价不出金额行", async () => {
    const ctx = newPage();
    void ctx.onShow();
    pendingReqs()[0].resolve(
      flowResp([
        flowItem({ operator_name: null, record_type: "offer", price: 0 }),
        flowItem({ id: "r2", record_type: "offer", price: -5 }),
      ]),
    );
    await Promise.resolve();
    await Promise.resolve();
    const items = ctx.data.items as AnyRecord[];
    expect(items[0].text).toContain("— 为");
    expect(items[0].priceText).toBe("");
    expect(items[1].priceText).toBe("");
  });

  it("total=0 → empty 态", async () => {
    const ctx = newPage();
    void ctx.onShow();
    pendingReqs()[0].resolve(flowResp([], 0));
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.data.state).toBe("empty");
  });
});

describe("类型筛选与分页", () => {
  it("切「出价」chip：带 record_type=offer 重拉第 1 页", async () => {
    const ctx = newPage({ state: "items" });
    ctx.onFilterTap({ currentTarget: { dataset: { key: "offer" } } });
    const urls = pendingReqs().map((r) => r.opts.url);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain("record_type=offer");
    expect(urls[0]).toContain("page=1");
  });

  it("点当前已选 chip 不重复请求", () => {
    const ctx = newPage({ state: "items", activeFilter: "all" });
    ctx.onFilterTap({ currentTarget: { dataset: { key: "all" } } });
    expect(pendingReqs()).toHaveLength(0);
  });

  it("触底分页：hasMore 时拉 page=2 并尾部追加", async () => {
    const ctx = newPage({ state: "items", page: 1, hasMore: true, total: 25 });
    void ctx.onShow();
    pendingReqs()[0].resolve(flowResp([flowItem()], 25, 1));
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.data.hasMore).toBe(true); // 1 * 20 < 25

    void ctx.onReachBottom();
    expect(pendingReqs()[1].opts.url).toContain("page=2");
    pendingReqs()[1].resolve(flowResp([flowItem({ id: "r2" })], 25, 2));
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.data.items).toHaveLength(2);
    expect(ctx.data.page).toBe(2);
    expect(ctx.data.hasMore).toBe(false); // 2 * 20 ≥ 25
  });

  it("hasMore=false 时触底不发请求；loadingMore 期间防抖", async () => {
    const ctx = newPage({ state: "items", hasMore: false, loadingMore: false });
    void ctx.onReachBottom();
    expect(pendingReqs()).toHaveLength(0);

    const ctx2 = newPage({ state: "items", hasMore: true, loadingMore: true });
    void ctx2.onReachBottom();
    expect(pendingReqs()).toHaveLength(0);
  });

  // 竞态防护（请求序号守卫）：筛选快速切换 / 触底与切筛并发时，旧响应不覆盖新状态
  it("竞态：筛选快速切换，先发请求的后到响应被丢弃，不覆盖新筛选列表", async () => {
    const ctx = newPage({ state: "items" });
    ctx.onFilterTap({ currentTarget: { dataset: { key: "offer" } } }); // seq=1
    ctx.onFilterTap({ currentTarget: { dataset: { key: "negotiation" } } }); // seq=2
    expect(pendingReqs()).toHaveLength(2);
    // 旧请求（offer）后到：必须被丢弃
    pendingReqs()[0].resolve(flowResp([flowItem({ id: "old-offer", record_type: "offer" })], 1));
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.data.state).toBe("loading"); // 状态机不被旧响应触碰
    expect(ctx.data.items).toHaveLength(0);
    // 新请求（negotiation）后到：正常采纳
    pendingReqs()[1].resolve(
      flowResp([flowItem({ id: "nego-1", record_type: "negotiation" })], 1),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.data.state).toBe("items");
    expect(ctx.data.items).toHaveLength(1);
    expect((ctx.data.items[0] as AnyRecord).typeLabel).toBe("面谈");
  });

  it("竞态：触底拉下一页期间切筛选，旧类型分页响应不 append 进新列表", async () => {
    const ctx = newPage({ state: "items", page: 1, hasMore: true, total: 25 });
    void ctx.onShow();
    pendingReqs()[0].resolve(flowResp([flowItem({ id: "r1" })], 25, 1));
    await Promise.resolve();
    await Promise.resolve();
    void ctx.onReachBottom(); // 发出 page=2（seq 不变）
    expect(pendingReqs()[1].opts.url).toContain("page=2");
    ctx.onFilterTap({ currentTarget: { dataset: { key: "offer" } } }); // seq+1，旧分页作废
    expect(pendingReqs()).toHaveLength(3);
    // 旧类型 page=2 后到：不得追加进新筛选列表
    pendingReqs()[1].resolve(flowResp([flowItem({ id: "stale-p2" })], 25, 2));
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.data.loadingMore).toBe(false);
    expect(ctx.data.items).toHaveLength(1); // 旧 r1 保留（切筛仅置 loading 不清 items），stale p2 未追加混入
    expect((ctx.data.items[0] as AnyRecord).id).toBe("r1");
    // 新筛选响应正常接管
    pendingReqs()[2].resolve(flowResp([flowItem({ id: "offer-1", record_type: "offer" })], 1));
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.data.items).toHaveLength(1);
    expect((ctx.data.items[0] as AnyRecord).typeLabel).toBe("出价");
  });
});

describe("状态机", () => {
  it("无令牌 → needLogin 且不发请求", async () => {
    mockGetAccessToken.mockReturnValue("");
    const ctx = newPage();
    void ctx.onShow();
    await Promise.resolve();
    expect(ctx.data.state).toBe("needLogin");
    expect(pendingReqs()).toHaveLength(0);
    mockGetAccessToken.mockReturnValue("tok");
  });

  it("401 → 清令牌切 needLogin", async () => {
    const ctx = newPage();
    void ctx.onShow();
    pendingReqs()[0].reject({ statusCode: 401 });
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.data.state).toBe("needLogin");
    expect(wxStubs.removeStorageSync).toHaveBeenCalledWith("access_token");
    expect(wxStubs.removeStorageSync).toHaveBeenCalledWith("refresh_token");
  });

  it("403 → noPermission（不清令牌）", async () => {
    const ctx = newPage();
    void ctx.onShow();
    pendingReqs()[0].reject({ statusCode: 403 });
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.data.state).toBe("noPermission");
    expect(wxStubs.removeStorageSync).not.toHaveBeenCalled();
  });

  it("500 → error 态", async () => {
    const ctx = newPage();
    void ctx.onShow();
    pendingReqs()[0].reject({ statusCode: 500 });
    await Promise.resolve();
    await Promise.resolve();
    expect(ctx.data.state).toBe("error");
  });
});

describe("渲染接线（wxml/wxss 静态校验）", () => {
  const wxml = recordsWxml;
  const wxss = recordsWxss;

  it("wxml：类型 chips 绑定 onFilterTap、列表绑定 items、出价金额行条件渲染", () => {
    expect(wxml).toContain('bindtap="onFilterTap"');
    expect(wxml).toContain('wx:for="{{items}}"');
    expect(wxml).toContain('wx:if="{{item.priceText}}"');
    expect(wxml).toContain("{{item.text}}");
    expect(wxml).toContain("{{item.dateText}}");
  });

  it("wxml：五态状态分支齐全（needLogin/noPermission/error/loading/empty）", () => {
    expect(wxml).toContain("needLogin");
    expect(wxml).toContain("noPermission");
    expect(wxml).toContain("error");
    expect(wxml).toContain("loading");
    expect(wxml).toContain("empty");
    expect(wxml).toContain("加载失败");
    expect(wxml).toContain("重试");
  });

  it("wxss：类型 chip 三色板（sky/apricot/gray）与金额行 rust 强调", () => {
    expect(wxss).toContain(".rec-chip--viewing {");
    expect(wxss).toContain("var(--sky-wash)");
    expect(wxss).toContain(".rec-chip--offer {");
    expect(wxss).toContain("var(--apricot-wash)");
    expect(wxss).toContain(".rec-chip--nego {");
    expect(wxss).toContain(".rec-price {");
    expect(wxss).toContain("var(--rust)");
  });
});
