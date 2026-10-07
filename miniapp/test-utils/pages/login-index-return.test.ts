/**
 * 微信登录入口页（login/index）「回跳来源白名单」回归测试.
 *
 * 与 login/password 是同一条中转链上**各自独立判定**的两层：
 * - 用户在本页直接「手机号快捷登录」成功 → 由本页白名单决定 navigateBack 还是 switchTab；
 * - 用户转走「账号密码登录」→ from 原样透传到 login/password，由那一层各自判定
 *   （见 login-password.test.ts）。
 *
 * 本迭代缺陷：房源详情页未登录 accept 后跳登录带 from=subscribe-project，但本页白名单
 * 只认 valuation/recruit/booking/subscribe，登录成功被规约为 switchTab 到「我的」tab，
 * 用户回不到原详情页，详情页 onShow 的订阅状态刷新/补报落空。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPageHarness, resetTestStubs, wxStubs } from "../test-harness";

const wechatLoginMock = vi.fn();
vi.mock("../../utils/wechat-auth", () => ({
  wechatLogin: () => wechatLoginMock(),
}));
vi.mock("../../utils/token", () => ({
  getCAccessToken: vi.fn(() => ""),
  getProtocolAgreed: vi.fn(() => false),
  setProtocolAgreed: vi.fn(),
}));

type AnyRecord = Record<string, any>;

beforeAll(async () => {
  await import("../../pages/login/index/index");
});

beforeEach(() => {
  resetTestStubs();
  wechatLoginMock.mockReset();
  // 本页用到的、harness 未预置的 wx API 补齐
  const wx = (globalThis as unknown as { wx: AnyRecord }).wx;
  wx.getPrivacySetting = vi.fn(({ success }: { success: (r: AnyRecord) => void }) =>
    success({ needAuthorization: false }),
  );
  wx.showLoading = vi.fn();
  wx.hideLoading = vi.fn();
});

/** 以 from 进入本页 → 勾选协议 → 点「手机号快捷登录」，模拟登录成功. */
async function loginWith(from?: string): Promise<AnyRecord> {
  const ctx = createPageHarness({});
  if (from !== undefined) {
    ctx.onLoad({ from });
  } else {
    ctx.onLoad({});
  }
  ctx.setData({ agreed: true });
  wechatLoginMock.mockResolvedValue({ success: true, isTemporary: false });
  ctx.onWechatLogin();
  await Promise.resolve();
  await Promise.resolve();
  return ctx;
}

describe("login/index 微信登录成功回跳来源", () => {
  it("from=subscribe-project（详情页调价订阅）→ navigateBack 回来源页", async () => {
    await loginWith("subscribe-project");

    expect(wxStubs.navigateBack).toHaveBeenCalled();
    expect(wxStubs.switchTab).not.toHaveBeenCalled();
  });

  it("from=subscribe（列表页频道订阅）→ navigateBack 回来源页", async () => {
    await loginWith("subscribe");

    expect(wxStubs.navigateBack).toHaveBeenCalled();
    expect(wxStubs.switchTab).not.toHaveBeenCalled();
  });

  it("from=booking（旧值不回归）→ navigateBack", async () => {
    await loginWith("booking");

    expect(wxStubs.navigateBack).toHaveBeenCalled();
    expect(wxStubs.switchTab).not.toHaveBeenCalled();
  });

  it("无 from（profile 入口）→ switchTab 到 profile，不 navigateBack", async () => {
    await loginWith();

    expect(wxStubs.switchTab).toHaveBeenCalledWith({ url: "/pages/profile/index/index" });
    expect(wxStubs.navigateBack).not.toHaveBeenCalled();
  });

  it("未知 from 值 → switchTab 到 profile（白名单外不误回退）", async () => {
    await loginWith("unknown-source");

    expect(wxStubs.switchTab).toHaveBeenCalledWith({ url: "/pages/profile/index/index" });
    expect(wxStubs.navigateBack).not.toHaveBeenCalled();
  });

  it("navigateBack 失败（分享卡片直达、页面栈为空）→ 回退 switchTab", async () => {
    await loginWith("subscribe-project");
    // 取最后一次 navigateBack 的参数，触发其 fail 回调
    const calls = wxStubs.navigateBack.mock.calls;
    const backCall = calls[calls.length - 1]?.[0] as { fail?: () => void } | undefined;
    expect(backCall?.fail).toBeTypeOf("function");
    wxStubs.switchTab.mockClear();
    backCall?.fail?.();

    expect(wxStubs.switchTab).toHaveBeenCalledWith({ url: "/pages/profile/index/index" });
  });
});
