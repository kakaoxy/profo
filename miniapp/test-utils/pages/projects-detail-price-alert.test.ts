/**
 * 房源详情页「调价提醒」订阅态回归测试.
 *
 * 覆盖本迭代修复 M10：模板配置异步返回时，onShow 的首次 refreshPriceAlertState
 * 已因 priceAlertEnabled=false 提前 return（旧注释称「由 onLoad 后的 onShow 统一执行」，
 * 但两者时序相反），导致已订阅用户**首次进入详情页**按钮显示「调价提醒」而非
 * 「已开启 · 可收 N 条」，须切后台再回前台才刷新。
 * 修复：loadPriceAlertTemplate 置 enabled 后立即补一次 refreshPriceAlertState。
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPageHarness, resetTestStubs, wxStubs } from "../test-harness";

const fetchTemplates = vi.fn();
const fetchProjectStatus = vi.fn();
const cancelProjectPriceSubscribe = vi.fn();
const requestProjectPriceSubscribe = vi.fn();

vi.mock("../../utils/marketing-notify", () => ({
  fetchMarketingSubscribeTemplates: () => fetchTemplates(),
  fetchProjectSubscriptionStatus: (id: number) => fetchProjectStatus(id),
  cancelProjectPriceSubscribe: (id: number) => cancelProjectPriceSubscribe(id),
  requestProjectPriceSubscribe: (id: number, tmpl: string, cb: (s: string, q: unknown) => void) =>
    requestProjectPriceSubscribe(id, tmpl, cb),
}));
vi.mock("../../utils/request", () => ({
  request: vi.fn(() => Promise.resolve({})),
}));
vi.mock("../../utils/url", () => ({
  resolveAssetUrl: (u: string | null | undefined) => u ?? "",
  resolveImageUrl: (u: string | null | undefined) => u ?? "",
}));
vi.mock("../../utils/token", () => ({
  getAccessToken: vi.fn(() => ""),
  getCAccessToken: vi.fn(() => "c-token"),
  getUserIdFromAccessToken: vi.fn(() => ""),
  hasValidAdminToken: vi.fn(() => false),
}));
vi.mock("../../utils/valuation-share", () => ({ fetchEmployeeId: vi.fn(() => Promise.resolve("")) }));
vi.mock("../../utils/visitor", () => ({ getVisitorId: vi.fn(() => "visitor-1") }));

type AnyRecord = Record<string, any>;

beforeEach(async () => {
  resetTestStubs();
  vi.resetModules();
  fetchTemplates.mockReset();
  fetchProjectStatus.mockReset();
  cancelProjectPriceSubscribe.mockReset();
  requestProjectPriceSubscribe.mockReset();
  const wx = (globalThis as unknown as { wx: AnyRecord }).wx;
  wx.showShareMenu = vi.fn();
  wx.getStorageSync = vi.fn(() => null);
  wx.showToast = wxStubs.showToast;
  wx.showModal = vi.fn();
  wx.navigateTo = wxStubs.navigateTo;
  await import("../../pages/projects/detail/index");
});

function detailPage(id: number): AnyRecord {
  return createPageHarness({ id });
}

describe("M10 首次进入详情页即回显订阅态", () => {
  it("模板可用 → 拉取房源级订阅状态并渲染「已开启 · 可收 N 条」", async () => {
    fetchTemplates.mockResolvedValue({ newListingTemplateId: "T1", priceChangeTemplateId: "T2" });
    fetchProjectStatus.mockResolvedValue({ subscribed: true, priceChangeQuota: 2, lastSubscribedAt: null });
    const ctx = detailPage(5001);

    await ctx.loadPriceAlertTemplate();

    expect(ctx.data.priceAlertEnabled).toBe(true);
    expect(fetchProjectStatus).toHaveBeenCalledWith(5001);
    expect(ctx.data.priceAlertSubscribed).toBe(true);
    expect(ctx.data.priceAlertQuota).toBe(2);
  });

  it("模板未配置（subscribe_enabled=false）→ 入口隐藏且不查订阅状态", async () => {
    fetchTemplates.mockResolvedValue(null);
    const ctx = detailPage(5002);

    await ctx.loadPriceAlertTemplate();

    expect(ctx.data.priceAlertEnabled).toBe(false);
    expect(ctx.priceAlertTemplateId).toBe(null);
    expect(fetchProjectStatus).not.toHaveBeenCalled();
  });

  it("仅配置上新模板（无调价模板）→ 调价提醒入口隐藏", async () => {
    fetchTemplates.mockResolvedValue({ newListingTemplateId: "T1", priceChangeTemplateId: null });
    const ctx = detailPage(5003);

    await ctx.loadPriceAlertTemplate();

    expect(ctx.data.priceAlertEnabled).toBe(false);
    expect(fetchProjectStatus).not.toHaveBeenCalled();
  });

  it("未登录/查询失败（status=null）→ 保持未订阅态，不报错", async () => {
    fetchTemplates.mockResolvedValue({ newListingTemplateId: "T1", priceChangeTemplateId: "T2" });
    fetchProjectStatus.mockResolvedValue(null);
    const ctx = detailPage(5004);

    await ctx.loadPriceAlertTemplate();

    expect(ctx.data.priceAlertEnabled).toBe(true);
    expect(ctx.data.priceAlertSubscribed).toBe(false);
    expect(ctx.data.priceAlertQuota).toBe(0);
  });
});

describe("调价提醒交互链路", () => {
  it("已订阅有额度 → 点击即走取消流程（不重复拉起授权面板）", async () => {
    fetchTemplates.mockResolvedValue({ newListingTemplateId: "T1", priceChangeTemplateId: "T2" });
    fetchProjectStatus.mockResolvedValue({ subscribed: true, priceChangeQuota: 1, lastSubscribedAt: null });
    const ctx = detailPage(5005);
    await ctx.loadPriceAlertTemplate();

    ctx.onPriceAlertTap();
    // 取消走 wx.showModal 确认；不应调用 requestProjectPriceSubscribe
    expect((globalThis as unknown as { wx: AnyRecord }).wx.showModal).toHaveBeenCalled();
    expect(requestProjectPriceSubscribe).not.toHaveBeenCalled();
  });

  it("未订阅 → 点击同步发起 requestProjectPriceSubscribe（保持 tap 手势内）", async () => {
    fetchTemplates.mockResolvedValue({ newListingTemplateId: "T1", priceChangeTemplateId: "T2" });
    fetchProjectStatus.mockResolvedValue({ subscribed: false, priceChangeQuota: 0, lastSubscribedAt: null });
    const ctx = detailPage(5006);
    await ctx.loadPriceAlertTemplate();

    ctx.onPriceAlertTap();

    expect(requestProjectPriceSubscribe).toHaveBeenCalledWith(5006, "T2", expect.any(Function));
  });

  it("取消确认后清零并回未订阅态（服务端真实状态为准）", async () => {
    fetchTemplates.mockResolvedValue({ newListingTemplateId: "T1", priceChangeTemplateId: "T2" });
    fetchProjectStatus
      .mockResolvedValueOnce({ subscribed: true, priceChangeQuota: 3, lastSubscribedAt: null })
      .mockResolvedValueOnce({ subscribed: true, priceChangeQuota: 0, lastSubscribedAt: null });
    cancelProjectPriceSubscribe.mockResolvedValue({ subscribed: true, priceChangeQuota: 0, lastSubscribedAt: null });
    const ctx = detailPage(5007);
    await ctx.loadPriceAlertTemplate();
    expect(ctx.data.priceAlertQuota).toBe(3);

    // showModal 直接回调 confirm=true
    (globalThis as unknown as { wx: AnyRecord }).wx.showModal = vi.fn(
      (opts: { success?: (r: { confirm: boolean }) => void }) => opts.success?.({ confirm: true }),
    );
    await ctx.cancelPriceAlert(5007);

    expect(cancelProjectPriceSubscribe).toHaveBeenCalledWith(5007);
    expect(ctx.data.priceAlertQuota).toBe(0);
  });
});
