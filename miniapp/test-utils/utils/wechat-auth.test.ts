/**
 * wechat-auth 单测：wx.login → POST /auth/wechat/login → 四令牌写入与
 * 临时账号标识；员工双令牌 vs C 端单令牌回退；失败路径不抛异常.
 */
import { describe, expect, it, beforeEach, vi } from "vitest";
import { wechatLogin } from "../../utils/wechat-auth";

type WxRequestOptions = {
  url: string;
  method?: string;
  data?: unknown;
  header?: Record<string, string>;
  success: (res: { statusCode: number; data: unknown }) => void;
  fail: (err: { errMsg: string }) => void;
};

const storage = new Map<string, unknown>();
let loginResult: { code: string } | null = null;
let loginError: { errMsg: string } | null = null;
let requestHandlers: Array<(opts: WxRequestOptions) => void> = [];

beforeEach(() => {
  storage.clear();
  loginResult = { code: "wx-code" };
  loginError = null;
  requestHandlers = [];
  vi.stubGlobal("wx", {
    login: vi.fn((opts: {
      success: (res: { code: string }) => void;
      fail: (err: { errMsg: string }) => void;
    }) => {
      if (loginError) {
        opts.fail(loginError);
      } else if (loginResult) {
        opts.success({ code: loginResult.code });
      }
    }),
    request: vi.fn((opts: WxRequestOptions) => {
      const handler = requestHandlers.shift();
      if (handler) {
        handler(opts);
      }
    }),
    getStorageSync: vi.fn((key: string) => storage.get(key)),
    setStorageSync: vi.fn((key: string, val: unknown) => {
      storage.set(key, val);
    }),
    removeStorageSync: vi.fn((key: string) => {
      storage.delete(key);
    }),
  });
});

describe("wechatLogin 成功路径", () => {
  it("纯 C 端用户：单令牌回退写入四槽，is_temporary=false", async () => {
    requestHandlers = [
      (opts) => {
        expect(opts.url).toContain("/auth/wechat/login");
        expect(opts.method).toBe("POST");
        expect(opts.data).toEqual({ code: "wx-code" });
        opts.success({
          statusCode: 200,
          data: {
            access_token: "main-tok",
            refresh_token: "main-ref",
            is_temporary: false,
          },
        });
      },
    ];
    const result = await wechatLogin();
    expect(result).toEqual({ success: true, isTemporary: false });
    expect(storage.get("access_token")).toBe("main-tok");
    expect(storage.get("refresh_token")).toBe("main-ref");
    // C 端槽回退主令牌
    expect(storage.get("c_access_token")).toBe("main-tok");
    expect(storage.get("c_refresh_token")).toBe("main-ref");
    expect(storage.get("c_user_temporary")).toBe("false");
  });

  it("内部员工：后端双令牌，C 端槽使用独立令牌", async () => {
    requestHandlers = [
      (opts) =>
        opts.success({
          statusCode: 200,
          data: {
            access_token: "admin-tok",
            refresh_token: "admin-ref",
            c_access_token: "c-tok",
            c_refresh_token: "c-ref",
            is_temporary: false,
          },
        }),
    ];
    const result = await wechatLogin();
    expect(result.success).toBe(true);
    expect(storage.get("access_token")).toBe("admin-tok");
    expect(storage.get("c_access_token")).toBe("c-tok");
    expect(storage.get("c_refresh_token")).toBe("c-ref");
  });

  it("临时账号：is_temporary=true 写入 c_user_temporary=true", async () => {
    requestHandlers = [
      (opts) =>
        opts.success({
          statusCode: 200,
          data: {
            access_token: "t",
            refresh_token: "r",
            is_temporary: true,
          },
        }),
    ];
    const result = await wechatLogin();
    expect(result).toEqual({ success: true, isTemporary: true });
    expect(storage.get("c_user_temporary")).toBe("true");
  });
});

describe("wechatLogin 失败路径", () => {
  it("wx.login 失败返回 error，不抛异常", async () => {
    loginError = { errMsg: "login:fail auth deny" };
    const result = await wechatLogin();
    expect(result.success).toBe(false);
    expect(result.error).toBe("login:fail auth deny");
  });

  it("wx.login 未返回 code 返回 error", async () => {
    loginResult = { code: "" };
    const result = await wechatLogin();
    expect(result.success).toBe(false);
    expect(result.error).toContain("授权码");
  });

  it("HTTP 非 2xx 返回 body.message", async () => {
    requestHandlers = [
      (opts) => opts.success({ statusCode: 400, data: { message: "登录参数错误" } }),
    ];
    const result = await wechatLogin();
    expect(result.success).toBe(false);
    expect(result.error).toBe("登录参数错误");
  });

  it("网络异常返回 errMsg", async () => {
    requestHandlers = [(opts) => opts.fail({ errMsg: "request:fail" })];
    const result = await wechatLogin();
    expect(result.success).toBe(false);
    expect(result.error).toBe("request:fail");
  });
});
