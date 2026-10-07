/**
 * 「我的」页登出与 C 端状态标识（H3 静默续登绕过登出）回归测试.
 *
 * 缺陷背景：App.onLaunch 的静默续登条件是 `!getCAccessToken() && getProtocolAgreed()`，
 * 而 c_protocol_agreed 只在 clearCUserState() 里被删除。旧 onLogout 只删 4 个令牌 key、
 * 未清状态标识 → 用户点「退出登录」后杀进程重进，冷启动静默 wx.login 把刚登出的账号
 * 重新登回来：登出在共享/借用设备上失效，且 openid 在用户撤回同意后仍被静默采集。
 *
 * 两条路径语义必须区分：
 * - onLogout（显式登出）→ 清 c_protocol_agreed（撤回本机知情同意，静默续登不再触发）；
 * - clearTokensAndReset（401/403 被动失效）→ **保留** c_protocol_agreed，
 *   否则令牌一过期就得重新手动登录，破坏既有静默续登设计。
 *
 * utils/token 不 mock：真实 clearCUserState 跑在 wx storage 桩上，断言实际存储删除。
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPageHarness, resetTestStubs, wxStubs } from "../test-harness";

vi.mock("../../utils/request", () => ({
  request: vi.fn(() => Promise.resolve({})),
  refreshCAccessToken: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("../../utils/customers-badge", () => ({ fetchCustomersBadgeCount: vi.fn(() => Promise.resolve(0)) }));
vi.mock("../../utils/pending-assessment", () => ({
  fetchPendingAssessmentCount: vi.fn(() => Promise.resolve(0)),
}));
vi.mock("../../utils/profile", () => ({ updateWechatProfile: vi.fn() }));
vi.mock("../../utils/url", () => ({ resolveAssetUrl: (u: string | null | undefined) => u ?? "" }));

/** wx storage 桩的真实存储（Map），供断言 key 是否被删除. */
const store = new Map<string, unknown>();

beforeAll(async () => {
  await import("../../pages/profile/index/index");
});

beforeEach(() => {
  resetTestStubs();
  store.clear();
  const wx = (globalThis as unknown as { wx: Record<string, unknown> }).wx;
  wx.getStorageSync = vi.fn((key: string) => store.get(key) ?? "");
  wx.setStorageSync = vi.fn((key: string, value: unknown) => {
    store.set(key, value);
  });
  wx.removeStorageSync = vi.fn((key: string) => {
    store.delete(key);
  });
  // 模拟一个已登录且曾同意过协议的设备
  store.set("c_protocol_agreed", "true");
  store.set("c_user_temporary", "true");
  store.set("c_phone_prompted", "true");
  store.set("access_token", "admin-token");
  store.set("refresh_token", "admin-refresh");
  store.set("c_access_token", "c-token");
  store.set("c_refresh_token", "c-refresh");
});

function seedLoggedIn(): ReturnType<typeof createPageHarness> {
  return createPageHarness({ loading: false, loggedIn: true, nickname: "测试用户" });
}

describe("显式登出（onLogout）撤回本机知情同意", () => {
  it("登出清除 c_protocol_agreed：冷启动静默续登不再把用户登回来", async () => {
    const ctx = seedLoggedIn();
    await ctx.onLogout();

    expect(store.has("c_protocol_agreed")).toBe(false);
    expect(store.has("c_access_token")).toBe(false);
    expect(store.has("c_refresh_token")).toBe(false);
    expect(store.has("access_token")).toBe(false);
  });

  it("登出一并清除 c_user_temporary / c_phone_prompted 状态标识", async () => {
    const ctx = seedLoggedIn();
    await ctx.onLogout();

    expect(store.has("c_user_temporary")).toBe(false);
    expect(store.has("c_phone_prompted")).toBe(false);
  });

  it("登出后 UI 复位为未登录态", async () => {
    const ctx = seedLoggedIn();
    await ctx.onLogout();

    expect(ctx.data.loggedIn).toBe(false);
    expect(wxStubs.showToast).toHaveBeenCalledWith({ title: "已退出登录", icon: "none" });
  });
});

describe("被动失效（clearTokensAndReset）保留知情同意", () => {
  it("401/403 令牌失效只清令牌，不清 c_protocol_agreed（静默续登仍可用）", () => {
    const ctx = seedLoggedIn();
    ctx.clearTokensAndReset();

    expect(store.has("c_access_token")).toBe(false);
    expect(store.has("access_token")).toBe(false);
    // ⚠️ 关键差异断言：被动失效不等于用户撤回同意
    expect(store.get("c_protocol_agreed")).toBe("true");
  });
});

describe("App.onLaunch 静默续登（真实冷启动路径）", () => {
  /** 以当前 store 为 storage 冷启动 app.ts，返回 wechatLogin 是否被调用. */
  async function coldStart(): Promise<boolean> {
    const loginMock = vi.fn(() => Promise.resolve({ success: true }));
    vi.doMock("../../utils/wechat-auth", () => ({ wechatLogin: loginMock }));
    vi.doMock("../../utils/performance", () => ({
      initPerformanceMonitor: vi.fn(),
      markLaunchDone: vi.fn(),
    }));
    // 用无类型 holder 承接 App(cfg) 的配置（避免 TS 把 null 初始化收窄成 never）
    const holder: Record<string, unknown> = {};
    vi.stubGlobal("App", (cfg: unknown) => {
      holder.cfg = cfg;
    });
    // utils/token 不 mock：走真实 getCAccessToken/getProtocolAgreed 读 store
    vi.resetModules();
    await import("../../app");
    (holder.cfg as { onLaunch?: () => void } | undefined)?.onLaunch?.();
    // fire-and-forget：微队列跑一拍
    await Promise.resolve();
    vi.doUnmock("../../utils/wechat-auth");
    vi.doUnmock("../../utils/performance");
    return loginMock.mock.calls.length > 0;
  }

  it("登出后冷启动：不发起静默 wx.login（登出真实生效）", async () => {
    const ctx = seedLoggedIn();
    await ctx.onLogout();

    expect(await coldStart()).toBe(false);
  });

  it("仅令牌过期（未登出）冷启动：仍静默续登恢复登录态", async () => {
    // 不走登出流程：直接模拟令牌自然消失，c_protocol_agreed 保留
    store.delete("c_access_token");

    expect(await coldStart()).toBe(true);
  });

  it("从未同意过协议的新设备冷启动：不发起任何登录请求", async () => {
    store.delete("c_protocol_agreed");
    store.delete("c_access_token");

    expect(await coldStart()).toBe(false);
  });
});
