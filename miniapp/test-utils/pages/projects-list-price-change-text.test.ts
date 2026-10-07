/**
 * 房源列表页「调价徽标文案」与「未登录订阅态」回归测试.
 *
 * 覆盖本迭代审查的两处修复：
 * - M4 差价精度：后端 total_price 为 Numeric(12,2)，差价可小于 1 万。旧实现
 *   `Math.round(diff)` 会把 246.00 → 245.50（差 0.5 万）显示成「↓ 直降 0 万」。
 *   现按 0.01 万截断去尾零；不足 0.01 万时回退中性文案，不出现「直降 0 万」。
 * - M9 未登录 accept 态：未登录时服务端无额度可查（额度仅在 report 后累计），
 *   旧实现只置 subscribeState="on" 而不更新 subscribeQuota，wxml 渲染出
 *   「已订阅 · 可收 0 条」的自相矛盾文案。现由 subscribePendingLogin 走
 *   「已授权 · 登录后生效」文案。
 */
import { afterEach, afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

const subscribeMock = vi.fn();
const showModalMock = vi.fn();

beforeAll(async () => {
  (globalThis as unknown as { wx: Record<string, unknown> }).wx = {
    ...(globalThis as unknown as { wx: Record<string, unknown> }).wx,
    requestSubscribeMessage: subscribeMock,
    // 统一复用 wxStubs 里的 spy（resetTestStubs 会清理它们）
    showToast: wxStubs.showToast,
    showModal: showModalMock,
    openSetting: vi.fn(),
    navigateTo: wxStubs.navigateTo,
    navigateBack: wxStubs.navigateBack,
    switchTab: wxStubs.switchTab,
    setStorageSync: wxStubs.setStorageSync,
    getStorageSync: wxStubs.getStorageSync,
    removeStorageSync: wxStubs.removeStorageSync,
  };
  await import("../../pages/projects/list/index");
});

beforeEach(() => {
  resetTestStubs();
  subscribeMock.mockClear();
  showModalMock.mockClear();
  // 默认已登录（用例内按需覆盖）
  mockLoggedIn("tok");
});

afterEach(() => {
  vi.useRealTimers();
});

/** 模拟登录态：token 为 null 时模拟未登录（getCAccessToken 返回空串）. */
function mockLoggedIn(token: string | null) {
  (globalThis as unknown as { wx: Record<string, unknown> }).wx.getStorageSync = vi.fn((key: string) =>
    key === "c_access_token" && token ? token : null,
  );
}

/** 让微任务队列排空（异步链路跨多个 await）. */
function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

/** 按 url 前缀取出并放行一个受控请求. */
function nextResolve(urlPrefix: string, data: unknown): void {
  const queue = pendingReqs();
  const idx = queue.findIndex((r) => r.opts.url.startsWith(urlPrefix));
  if (idx >= 0) {
    const [req] = queue.splice(idx, 1);
    req.resolve(data);
  }
}

/** 放行 subscribe-template（模板已配置）. */
function resolveTemplates(): void {
  nextResolve("/public/marketing/subscribe-template", {
    subscribe_enabled: true,
    new_listing_template_id: "T1",
    price_change_template_id: "T2",
  });
}

afterAll(() => {
  vi.resetModules();
});

function onSaleItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 1001,
    title: "测试房源",
    community_name: "测试小区",
    layout: "三室两厅",
    area: 120,
    total_price: 245.5,
    unit_price: 2.04,
    cover_image: "",
    tags: [],
    project_status: "在售",
    decoration_style: null,
    is_new_listing: false,
    latest_price_change: null,
    ...overrides,
  };
}

/** 构造一条窗口期内调价记录. */
function priceChange(oldPrice: number, newPrice: number, direction: "down" | "up") {
  return {
    old_price: oldPrice,
    new_price: newPrice,
    direction,
    changed_at: "2026-10-06T10:00:00Z",
  };
}

type AnyRecord = Record<string, any>;

function displayOf(item: Record<string, unknown>) {
  const ctx = createPageHarness({});
  return ctx.toDisplay(item as never, "on_sale" as never);
}

describe("M4 调价文案差价精度（后端价 Numeric(12,2)）", () => {
  it("直降 0.5 万：显示「直降 0.5 万」，不得显示「直降 0 万」", () => {
    const d = displayOf(onSaleItem({ latest_price_change: priceChange(246.0, 245.5, "down") }));

    expect(d.changeText).toBe("↓ 直降 0.5 万");
    expect(d.changeText).not.toContain("直降 0 万");
    expect(d.changeClass).toBe("change-down");
  });

  it("直降 0.01 万：仍显示具体金额", () => {
    const d = displayOf(onSaleItem({ latest_price_change: priceChange(246.0, 245.99, "down") }));

    expect(d.changeText).toBe("↓ 直降 0.01 万");
  });

  it("差价不足 0.01 万：回退中性文案，不出现「直降 0 万」假象", () => {
    const d = displayOf(onSaleItem({ latest_price_change: priceChange(246.0, 245.999, "down") }));

    expect(d.changeText).toBe("↓ 价格已下调");
    expect(d.changeText).not.toMatch(/直降 0(\.0+)? 万/);
  });

  it("直降整数差价：去掉无意义小数尾零（7.00 → 7）", () => {
    const d = displayOf(onSaleItem({ latest_price_change: priceChange(428.0, 421.0, "down") }));

    expect(d.changeText).toBe("↓ 直降 7 万");
  });

  it("涨价：中性文案「价格已更新」（不做营销渲染）", () => {
    const d = displayOf(onSaleItem({ latest_price_change: priceChange(240.0, 246.5, "up") }));

    expect(d.changeText).toBe("↑ 价格已更新");
    expect(d.changeClass).toBe("change-up");
  });

  it("无调价记录：不渲染调价行", () => {
    const d = displayOf(onSaleItem({ latest_price_change: null }));

    expect(d.changeText).toBe("");
    expect(d.changeMeta).toBe("");
  });

  it("调价副行含原价与调整日期", () => {
    const d = displayOf(onSaleItem({ latest_price_change: priceChange(246.0, 245.5, "down") }));

    expect(d.changeMeta).toContain("原价 246 万");
    expect(d.changeMeta).toContain("10/06");
  });
});

describe("M9 未登录 accept：不虚报「可收 0 条」", () => {
  /** 注入模板对 → tap「开启提醒」→ 回调内模拟 T1 accept. */
  function acceptViaSheet(ctx: AnyRecord): void {
    ctx._subscribeTemplates = { newListingTemplateId: "T1", priceChangeTemplateId: "T2" };
    ctx.onSubscribeConfirm();
    const opts = subscribeMock.mock.calls[subscribeMock.mock.calls.length - 1][0] as {
      success: (res: Record<string, string>) => void;
    };
    opts.success({ T1: "accept", T2: "reject" });
  }

  it("未登录 accept：置 subscribePendingLogin，引导登录（额度仍为 0，不能渲染「可收 0 条」）", async () => {
    mockLoggedIn(null);
    const ctx = createPageHarness({ subscribeEnabled: true, sheetVisible: true });

    acceptViaSheet(ctx);
    await flush();

    expect(ctx.data.subscribePendingLogin).toBe(true);
    expect(ctx.data.subscribeQuota).toBe(0);
    expect(ctx.data.sheetVisible).toBe(false);
    expect(showModalMock).toHaveBeenCalledWith(expect.objectContaining({ confirmText: "去登录" }));
  });

  it("未登录 accept：不发 report 请求（免 401 噪音），待补报标记落位", async () => {
    mockLoggedIn(null);
    const ctx = createPageHarness({ subscribeEnabled: true, sheetVisible: true });

    acceptViaSheet(ctx);
    await flush();

    expect(pendingReqs().some((r) => r.opts.url.includes("subscriptions/report"))).toBe(false);
    expect(ctx._pendingSubscribeReport).toEqual({ newListingTemplateId: "T1", priceChangeTemplateId: "T2" });
  });

  it("未登录冷启动：不发 status，pendingLogin 保持 false（入口仍可见）", async () => {
    mockLoggedIn(null);
    const ctx = createPageHarness({});
    ctx.onLoad();
    await flush();
    resolveTemplates();
    await flush();

    expect(pendingReqs().some((r) => r.opts.url.includes("subscriptions/status"))).toBe(false);
    expect(ctx.data.subscribeEnabled).toBe(true);
    expect(ctx.data.subscribePendingLogin).toBe(false);
  });

  it("已登录 accept：report 发出并按响应写入真实额度，pendingLogin 保持 false", async () => {
    const ctx = createPageHarness({ subscribeEnabled: true, sheetVisible: true });

    acceptViaSheet(ctx);
    await flush();

    const report = pendingReqs().find((r) => r.opts.url.includes("subscriptions/report"));
    expect(report).toBeTruthy();
    report?.resolve({ new_listing_quota: 2, price_change_quota: 1 });
    await flush();

    expect(ctx.data.subscribeQuota).toBe(3);
    expect(ctx.data.subscribeState).toBe("on");
    expect(ctx.data.subscribePendingLogin).toBe(false);
    expect(ctx.data.sheetVisible).toBe(false);
  });

  it("服务端可查额度：清除 pendingLogin（登录补报已生效）", async () => {
    const ctx = createPageHarness({ subscribeEnabled: true, subscribePendingLogin: true });
    ctx.onLoad();
    await flush();
    resolveTemplates();
    await flush();
    const status = pendingReqs().find((r) => r.opts.url.includes("subscriptions/status"));
    expect(status).toBeTruthy();
    status?.resolve({ new_listing_quota: 1, price_change_quota: 0, last_subscribed_at: null });
    await flush();

    expect(ctx.data.subscribePendingLogin).toBe(false);
    expect(ctx.data.subscribeQuota).toBe(1);
  });


});
