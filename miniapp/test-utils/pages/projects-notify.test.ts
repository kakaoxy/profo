/**
 * 房源列表页订阅提醒流测试：
 * - 模板未配置（subscribe_enabled=false）→ 入口隐藏（subscribeEnabled=false）
 * - 拉到额度 → subscribeState/on + 弹层额度字段
 * - 额度耗尽 → expired 态
 * - onSubscribeConfirm 在 tap 回调内同步发起 requestSubscribeMessage，
 *   accept 上报后额度刷新
 * - 未登录：status/report 不发请求（免 401）；accept 后引导登录，
 *   登录返回 onShow 补报（重开弹层）
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

/* requestSubscribeMessage 桩（捕获参数，手动触发回调） */
const subscribeMock = vi.fn();
beforeAll(async () => {
  (globalThis as unknown as { wx: Record<string, unknown> }).wx = {
    ...(globalThis as unknown as { wx: Record<string, unknown> }).wx,
    requestSubscribeMessage: subscribeMock,
    showToast: wxStubs.showToast,
    showModal: vi.fn(),
    openSetting: vi.fn(),
  };
  await import("../../pages/projects/list/index");
});

beforeEach(() => {
  resetTestStubs();
  subscribeMock.mockClear();
  // 默认模拟已登录（既有用例依赖 status/report 正常发出的行为）；
  // 未登录专项用例在各自用例内覆盖
  mockLoggedIn("tok");
});

/** 模拟登录态：token 为 null 时模拟未登录（getCAccessToken 返回空串）. */
function mockLoggedIn(token: string | null) {
  (globalThis as unknown as { wx: Record<string, unknown> }).wx.getStorageSync = vi.fn(
    (key: string) => (key === "c_access_token" && token ? token : null),
  );
}

type AnyRecord = Record<string, any>;

/** 模拟一次指定 url 前缀的请求响应（其余请求留在队列末尾丢弃前先 resolve 空对象）. */
function nextResolve(urlPrefix: string, data: unknown) {
  const queue = pendingReqs();
  const idx = queue.findIndex((r) => r.opts.url.startsWith(urlPrefix));
  if (idx >= 0) {
    const [req] = queue.splice(idx, 1);
    req.resolve(data);
  }
}

describe("房源列表订阅提醒流", () => {
  it("模板未配置：subscribe-template 返回 enabled=false，入口整体隐藏", async () => {
    const ctx = createPageHarness();
    ctx.onLoad();
    await Promise.resolve();
    // 第一个请求：subscribe-template（enabled=false）
    nextResolve("/public/marketing/subscribe-template", { subscribe_enabled: false, new_listing_template_id: null, price_change_template_id: null });
    await flush();
    expect(ctx.data.subscribeEnabled).toBe(false);
    expect(ctx.data.subscribeState).toBe("");
  });

  it("已订阅有额度：status 返回额度 → subscribeState=on，弹层展示分频道额度", async () => {
    const ctx = createPageHarness();
    ctx.onLoad();
    await Promise.resolve();
    nextResolve("/public/marketing/subscribe-template", { subscribe_enabled: true, new_listing_template_id: "T1", price_change_template_id: "T2" });
    await flush();
    nextResolve("/public/marketing/subscriptions/status", { new_listing_quota: 2, price_change_quota: 1, last_subscribed_at: null });
    await flush();
    expect(ctx.data.subscribeEnabled).toBe(true);
    expect(ctx.data.subscribeState).toBe("on");
    expect(ctx.data.subscribeQuota).toBe(3);
    expect(ctx.data.sheetNewQuota).toBe(2);
    expect(ctx.data.sheetPriceQuota).toBe(1);
  });

  it("额度耗尽：quota 全 0 → subscribeState=expired（续订提醒）", async () => {
    const ctx = createPageHarness();
    ctx.onLoad();
    await Promise.resolve();
    nextResolve("/public/marketing/subscribe-template", { subscribe_enabled: true, new_listing_template_id: "T1", price_change_template_id: "T2" });
    await flush();
    nextResolve("/public/marketing/subscriptions/status", { new_listing_quota: 0, price_change_quota: 0, last_subscribed_at: null });
    await flush();
    expect(ctx.data.subscribeState).toBe("expired");
  });

  it("onSubscribeConfirm 同步发起授权；accept 上报后额度刷新并收起弹层", async () => {
    const ctx = createPageHarness({
      subscribeEnabled: true,
      sheetVisible: true,
      sheetNewQuota: 0,
      sheetPriceQuota: 0,
    });
    ctx._subscribeTemplates = { newListingTemplateId: "T1", priceChangeTemplateId: "T2" };

    // tap 内同步调用（同步断言已发起）
    ctx.onSubscribeConfirm();
    expect(subscribeMock).toHaveBeenCalledTimes(1);
    expect(subscribeMock.mock.calls[0][0].tmplIds).toEqual(["T1", "T2"]);

    // 模拟用户两频道都 accept
    subscribeMock.mock.calls[0][0].success({
      T1: "accept",
      T2: "accept",
    });
    await Promise.resolve();
    // 上报响应：额度累计 new=1 price=1
    nextResolve("/public/marketing/subscriptions/report", { new_listing_quota: 1, price_change_quota: 1 });
    await flush();

    expect(wxStubs.showToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "已开启提醒", icon: "success" }),
    );
    expect(ctx.data.subscribeState).toBe("on");
    expect(ctx.data.subscribeQuota).toBe(2);
    expect(ctx.data.sheetVisible).toBe(false);
  });

  it("ban：不 toast 成功，弹引导 modal", async () => {
    const showModal = vi.fn();
    (globalThis as unknown as { wx: Record<string, unknown> }).wx.showModal = showModal;
    const ctx = createPageHarness({ subscribeEnabled: true, sheetVisible: true });
    ctx._subscribeTemplates = { newListingTemplateId: "T1", priceChangeTemplateId: null };
    ctx.onSubscribeConfirm();
    subscribeMock.mock.calls[0][0].success({ T1: "ban" });
    // ban 结果也上报留痕（不计数），resolve 后才走 modal 分支
    nextResolve("/public/marketing/subscriptions/report", { new_listing_quota: 0, price_change_quota: 0 });
    await flush();
    expect(showModal).toHaveBeenCalledWith(
      expect.objectContaining({ title: "无法开启提醒", confirmText: "去设置" }),
    );
    expect(ctx.data.sheetVisible).toBe(false);
  });
});


describe("未登录订阅流（401 修复）", () => {
  afterEach(() => {
    // 清理登录态桩（下一用例 beforeEach 会重设）
    (globalThis as unknown as { wx: Record<string, unknown> }).wx.getStorageSync = wxStubs.getStorageSync;
  });

  it("未登录：status 不发请求（免 401），额度展示 0", async () => {
    mockLoggedIn(null);
    const ctx = createPageHarness();
    ctx.onLoad();
    await Promise.resolve();
    nextResolve("/public/marketing/subscribe-template", { subscribe_enabled: true, new_listing_template_id: "T1", price_change_template_id: "T2" });
    await flush();
    expect(ctx.data.subscribeEnabled).toBe(true);
    // 未登录不发 status 请求：pending 队列中不存在 subscriptions/status
    expect(pendingReqs().some((r) => r.opts.url.includes("subscriptions/status"))).toBe(false);
    expect(ctx.data.subscribeState).toBe("expired");
    expect(ctx.data.subscribeQuota).toBe(0);
  });

  it("未登录 accept：不发 report（免 401），引导登录并记录待补报", async () => {
    mockLoggedIn(null);
    const showModal = vi.fn();
    (globalThis as unknown as { wx: Record<string, unknown> }).wx.showModal = showModal;
    const ctx = createPageHarness({ subscribeEnabled: true, sheetVisible: true });
    ctx._subscribeTemplates = { newListingTemplateId: "T1", priceChangeTemplateId: "T2" };

    ctx.onSubscribeConfirm();
    subscribeMock.mock.calls[0][0].success({ T1: "accept", T2: "reject" });

    await flush();
    // 未登录不发 report 请求
    expect(pendingReqs().some((r) => r.opts.url.includes("subscriptions/report"))).toBe(false);
    // 本地置为已订阅态 + 引导登录
    expect(ctx.data.subscribeState).toBe("on");
    expect(ctx.data.sheetVisible).toBe(false);
    expect(showModal).toHaveBeenCalledWith(expect.objectContaining({ confirmText: "去登录" }));
    expect(ctx._pendingSubscribeReport).toEqual({ newListingTemplateId: "T1", priceChangeTemplateId: "T2" });
  });

  it("登录返回 onShow：补报待处理订阅 → 重开弹层", async () => {
    mockLoggedIn("tok-after-login");
    const ctx = createPageHarness({ subscribeEnabled: true });
    ctx._pendingSubscribeReport = { newListingTemplateId: "T1", priceChangeTemplateId: "T2" };

    ctx.onShow();
    // 待补报消费置空 + 重开弹层 + 拉取额度
    expect(ctx._pendingSubscribeReport).toBe(null);
    expect(ctx.data.sheetVisible).toBe(true);
    await Promise.resolve();
    nextResolve("/public/marketing/subscribe-template", { subscribe_enabled: true, new_listing_template_id: "T1", price_change_template_id: "T2" });
    await flush();
    // 已登录：status 正常发出
    expect(pendingReqs().some((r) => r.opts.url.includes("subscriptions/status"))).toBe(true);
  });

  it("已登录 accept：report 正常发出并按响应刷新额度", async () => {
    mockLoggedIn("tok");
    const ctx = createPageHarness({ subscribeEnabled: true, sheetVisible: true });
    ctx._subscribeTemplates = { newListingTemplateId: "T1", priceChangeTemplateId: null };

    ctx.onSubscribeConfirm();
    subscribeMock.mock.calls[0][0].success({ T1: "accept" });
    await Promise.resolve();
    nextResolve("/public/marketing/subscriptions/report", { new_listing_quota: 1, price_change_quota: 0 });
    await flush();

    expect(wxStubs.showToast).toHaveBeenCalledWith(expect.objectContaining({ title: "已开启提醒", icon: "success" }));
    expect(ctx.data.subscribeState).toBe("on");
    expect(ctx.data.subscribeQuota).toBe(1);
  });
});

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}
