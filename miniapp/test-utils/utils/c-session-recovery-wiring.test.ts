import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 接线验证：app.ts 注册的「C 端会话恢复」回调必须真的被 request.ts 消费.
 *
 * 背景（线上缺陷）：C 端 refresh_token 失效后，请求层只能返回 null 并清空令牌，
 * 小程序进入「看似已登录、但 /public/* 全部 401」的僵死状态——绑定已有账号
 * （POST /public/users/merge）永远 401，页面只能提示笼统的「绑定失败」。
 *
 * 本用例不走 mock 的 request 模块，而是用真实的 utils/request + 真实的 app.onLaunch，
 * 只把 wechatLogin 换成桩：验证「注册 → 401 → 静默重登 → 用新令牌重试」整条链路。
 */

type WxRequestOptions = {
  url: string;
  method?: string;
  header?: Record<string, string>;
  success: (res: { statusCode: number; data: unknown }) => void;
  fail: (err: unknown) => void;
};

const storage = new Map<string, unknown>();
let handlers: ((opts: WxRequestOptions) => void)[] = [];

function ok(data: unknown, statusCode = 200) {
  return (opts: WxRequestOptions) => opts.success({ statusCode, data });
}

function queueResponses(list: ((opts: WxRequestOptions) => void)[]) {
  handlers = [...list];
}

beforeEach(() => {
  storage.clear();
  handlers = [];
  vi.stubGlobal("wx", {
    request: vi.fn((opts: WxRequestOptions) => {
      const handler = handlers.shift();
      if (handler) {
        handler(opts);
      }
    }),
    getStorageSync: vi.fn((key: string) => storage.get(key)),
    setStorageSync: vi.fn((key: string, value: unknown) => {
      storage.set(key, value);
    }),
    removeStorageSync: vi.fn((key: string) => {
      storage.delete(key);
    }),
  });
});

/** 冷启动 app.ts（真实 onLaunch），返回 wechatLogin 桩. */
async function coldStartApp() {
  const loginMock = vi.fn(() => {
    // 模拟微信静默登录成功：刷新令牌落盘
    storage.set("access_token", "fresh-admin");
    storage.set("refresh_token", "fresh-admin-refresh");
    storage.set("c_access_token", "fresh-c");
    storage.set("c_refresh_token", "fresh-c-refresh");
    return Promise.resolve({ success: true });
  });
  vi.doMock("../../utils/wechat-auth", () => ({ wechatLogin: loginMock }));
  vi.doMock("../../utils/performance", () => ({
    initPerformanceMonitor: vi.fn(),
    markLaunchDone: vi.fn(),
  }));
  const holder: Record<string, unknown> = {};
  vi.stubGlobal("App", (cfg: unknown) => {
    holder.cfg = cfg;
  });
  vi.resetModules();
  await import("../../app");
  (holder.cfg as { onLaunch?: () => void } | undefined)?.onLaunch?.();
  await Promise.resolve();
  // 与 app.ts 注册的是同一个（resetModules 之后的）模块实例
  const requestModule = await import("../../utils/request");
  return { loginMock, request: requestModule.request };
}

describe("C 端会话恢复接线（app.ts → request.ts）", () => {
  it("refresh_token 失效的 /public 请求：静默重登后用新令牌重试成功", async () => {
    // 已同意协议、且本地有（已过期的）C 端令牌 → onLaunch 不会触发静默续登
    storage.set("c_protocol_agreed", "true");
    storage.set("access_token", "stale-admin");
    storage.set("c_access_token", "stale-c");
    storage.set("c_refresh_token", "stale-c-refresh");

    const { loginMock, request } = await coldStartApp();
    expect(loginMock).not.toHaveBeenCalled();

    queueResponses([
      // 1) 原请求 401（access token 已过期）
      ok({ code: 401, message: "无法验证凭据" }, 401),
      // 2) /public/auth/refresh 401（refresh token 已失效）
      ok({ code: 401, message: "刷新令牌无效" }, 401),
      // 3) 静默重登后重试原请求，携带新 C 端令牌
      (opts) => {
        expect(opts.url).toContain("/public/users/merge");
        expect(opts.header?.Authorization).toBe("Bearer fresh-c");
        opts.success({ statusCode: 200, data: { success: true } });
      },
    ]);

    const res = await request<{ success: boolean }>({
      url: "/public/users/merge",
      method: "POST",
      data: { type: "internal", username: "zhangli", password: "***" },
    });

    expect(res).toEqual({ success: true });
    expect(loginMock).toHaveBeenCalledTimes(1);
  });

  it("未同意协议时不重登：请求以 401 失败（不越权收集 openid）", async () => {
    storage.set("access_token", "stale-admin");
    storage.set("c_access_token", "stale-c");
    storage.set("c_refresh_token", "stale-c-refresh");

    const { loginMock, request } = await coldStartApp();
    // 冷启动已尝试过一次静默续登（无 C 令牌 + 无同意），这里只关心恢复阶段
    loginMock.mockClear();

    queueResponses([ok({ code: 401, message: "无法验证凭据" }, 401), ok({}, 401)]);

    await expect(request({ url: "/public/users/merge", method: "POST", data: {} })).rejects.toMatchObject(
      { statusCode: 401 },
    );
    expect(loginMock).not.toHaveBeenCalled();
  });
});
