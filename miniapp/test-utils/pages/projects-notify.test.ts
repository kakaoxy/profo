/**
 * 房源列表页订阅提醒流测试：
 * - 模板未配置（subscribe_enabled=false）→ 入口隐藏（subscribeEnabled=false）
 * - 拉到额度 → subscribeState/on + 弹层额度字段
 * - 额度耗尽 → expired 态
 * - onSubscribeConfirm 在 tap 回调内同步发起 requestSubscribeMessage，
 *   accept 上报后额度刷新
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
});

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

function flush(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}
