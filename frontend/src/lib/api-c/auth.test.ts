import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockCookies } from "@/test/server-action-helpers";
import { loginAction, logoutAction, registerAction } from "./auth";

// ─── 模拟 NEXT_REDIRECT 错误 ────────────────────────────────
class NextRedirectError extends Error {
  digest: string;
  constructor(path: string) {
    super("NEXT_REDIRECT");
    this.digest = `NEXT_REDIRECT;${path};replace`;
  }
}

async function catchRedirect(fn: () => Promise<unknown>) {
  try {
    await fn();
    return null;
  } catch (e: unknown) {
    return e as NextRedirectError;
  }
}

// ─── Mocks ──────────────────────────────────────────────────
const mockCookies = createMockCookies();

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookies)),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new NextRedirectError(path);
  }),
}));

vi.mock("@/lib/config", () => ({
  apiPaths: {
    cAuth: {
      register: "/api/v1/public/auth/register",
      login: "/api/v1/public/auth/token",
      logout: "/api/v1/public/auth/logout",
      refresh: "/api/v1/public/auth/refresh",
    },
  },
  getApiUrl: (path: string) => `http://127.0.0.1:8000${path}`,
}));

// ─── 全局 fetch mock ────────────────────────────────────────
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// ─── 辅助函数 ───────────────────────────────────────────────
function makeFormData(entries: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    fd.set(k, v);
  }
  return fd;
}

// ─── 测试 ───────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  mockCookies.set.mockClear();
  mockCookies.get.mockClear();
  mockCookies.delete.mockClear();
});

describe("C端 loginAction", () => {
  it("空用户名或密码时返回错误", async () => {
    const fd = makeFormData({ username: "", password: "" });
    const result = await loginAction({ success: true, data: null }, fd);
    expect(result).toEqual({ success: false, error: "请输入账号和密码" });
  });

  it("登录成功时写入 cookies 并重定向到 /c", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "c_at_123",
        refresh_token: "c_rt_456",
        token_type: "bearer",
        expires_in: 1800,
        user: { nickname: "张三", phone: "13800138000" },
      }),
    });

    const fd = makeFormData({ username: "user1", password: "Pass1234" });
    const err = await catchRedirect(() =>
      loginAction({ success: true, data: null }, fd)
    );

    // 验证 fetch 调用
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/public/auth/token",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
    );

    // 验证 cookies 写入
    expect(mockCookies.set).toHaveBeenCalledWith(
      "c_access_token",
      "c_at_123",
      expect.objectContaining({ maxAge: 1800, httpOnly: true, path: "/" })
    );
    expect(mockCookies.set).toHaveBeenCalledWith(
      "c_refresh_token",
      "c_rt_456",
      expect.objectContaining({ maxAge: 60 * 60 * 24 * 7, httpOnly: true, path: "/" })
    );
    // 验证用户信息 cookie
    expect(mockCookies.set).toHaveBeenCalledWith(
      "c_user_info",
      JSON.stringify({ nickname: "张三", phone: "13800138000" }),
      expect.objectContaining({ maxAge: 1800, httpOnly: false, path: "/" })
    );

    // 验证重定向到 /c
    expect(err).not.toBeNull();
    expect(err!.digest).toContain("NEXT_REDIRECT;/c;replace");
  });

  it("登录失败时返回错误信息", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        detail: "用户名或密码错误",
      }),
    });

    const fd = makeFormData({ username: "user1", password: "wrong" });
    const result = await loginAction({ success: true, data: null }, fd);

    expect(result).toEqual({ success: false, error: "用户名或密码错误" });
    expect(mockCookies.set).not.toHaveBeenCalled();
  });

  it("登录失败时从 error.message 提取错误信息", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: "账号已被禁用" },
      }),
    });

    const fd = makeFormData({ username: "user1", password: "Pass1234" });
    const result = await loginAction({ success: true, data: null }, fd);

    expect(result).toEqual({ success: false, error: "账号已被禁用" });
  });

  it("登录失败时从 message 字段提取错误信息", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        message: "验证码已过期",
      }),
    });

    const fd = makeFormData({ username: "user1", password: "Pass1234" });
    const result = await loginAction({ success: true, data: null }, fd);

    expect(result).toEqual({ success: false, error: "验证码已过期" });
  });

  it("登录失败且无明确错误字段时使用默认消息", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    const fd = makeFormData({ username: "user1", password: "Pass1234" });
    const result = await loginAction({ success: true, data: null }, fd);

    expect(result).toEqual({ success: false, error: "登录失败" });
  });

  it("网络异常时返回网络错误", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const fd = makeFormData({ username: "user1", password: "Pass1234" });
    const result = await loginAction({ success: true, data: null }, fd);

    expect(result).toEqual({ success: false, error: "网络错误，请连接后端服务" });
  });

  it("用户信息中 nickname/phone 为 null 时正确处理", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "c_at",
        refresh_token: "c_rt",
        token_type: "bearer",
        expires_in: 1800,
        user: { nickname: null, phone: null },
      }),
    });

    const fd = makeFormData({ username: "user1", password: "Pass1234" });
    const err = await catchRedirect(() =>
      loginAction({ success: true, data: null }, fd)
    );

    expect(mockCookies.set).toHaveBeenCalledWith(
      "c_user_info",
      JSON.stringify({ nickname: null, phone: null }),
      expect.objectContaining({ maxAge: 1800 })
    );
    expect(err).not.toBeNull();
  });

  describe("重定向参数安全性", () => {
    it("redirect 参数以 /c/ 开头时允许重定向", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "c_at",
          refresh_token: "c_rt",
          token_type: "bearer",
          expires_in: 1800,
          user: { nickname: null, phone: null },
        }),
      });

      const fd = makeFormData({
        username: "user1",
        password: "Pass1234",
        redirect: "/c/projects/123",
      });
      const err = await catchRedirect(() =>
        loginAction({ success: true, data: null }, fd)
      );

      expect(err).not.toBeNull();
      expect(err!.digest).toContain("NEXT_REDIRECT;/c/projects/123;replace");
    });

    it("redirect 参数为 /c 时允许重定向", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "c_at",
          refresh_token: "c_rt",
          token_type: "bearer",
          expires_in: 1800,
          user: { nickname: null, phone: null },
        }),
      });

      const fd = makeFormData({
        username: "user1",
        password: "Pass1234",
        redirect: "/c",
      });
      const err = await catchRedirect(() =>
        loginAction({ success: true, data: null }, fd)
      );

      expect(err).not.toBeNull();
      expect(err!.digest).toContain("NEXT_REDIRECT;/c;replace");
    });

    it("⚠️未覆盖：redirect 参数为恶意路径时仍会重定向（当前代码未做安全校验）", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "c_at",
          refresh_token: "c_rt",
          token_type: "bearer",
          expires_in: 1800,
          user: { nickname: null, phone: null },
        }),
      });

      const fd = makeFormData({
        username: "user1",
        password: "Pass1234",
        redirect: "https://evil.com/phishing",
      });
      const err = await catchRedirect(() =>
        loginAction({ success: true, data: null }, fd)
      );

      // 当前代码直接使用 redirect 参数，未做路径校验
      // 这是一个安全隐患，测试记录此行为
      expect(err).not.toBeNull();
      expect(err!.digest).toContain("NEXT_REDIRECT;https://evil.com/phishing;replace");
    });

    it("无 redirect 参数时默认重定向到 /c", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "c_at",
          refresh_token: "c_rt",
          token_type: "bearer",
          expires_in: 1800,
          user: { nickname: null, phone: null },
        }),
      });

      const fd = makeFormData({ username: "user1", password: "Pass1234" });
      const err = await catchRedirect(() =>
        loginAction({ success: true, data: null }, fd)
      );

      expect(err).not.toBeNull();
      expect(err!.digest).toContain("NEXT_REDIRECT;/c;replace");
    });
  });
});

describe("C端 logoutAction", () => {
  it("有 token 时调用后端登出接口并删除 cookies", async () => {
    mockCookies.get.mockReturnValueOnce({ name: "c_access_token", value: "c_at_123" });
    mockFetch.mockResolvedValueOnce({ ok: true });

    const err = await catchRedirect(() => logoutAction());

    // 验证调用了后端登出接口
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/public/auth/logout",
      expect.objectContaining({
        method: "POST",
        headers: { Authorization: "Bearer c_at_123" },
      })
    );

    // 验证删除了所有 cookies
    expect(mockCookies.delete).toHaveBeenCalledWith("c_access_token");
    expect(mockCookies.delete).toHaveBeenCalledWith("c_refresh_token");
    expect(mockCookies.delete).toHaveBeenCalledWith("c_user_info");

    // 验证重定向
    expect(err).not.toBeNull();
    expect(err!.digest).toContain("NEXT_REDIRECT;/c;replace");
  });

  it("无 token 时跳过后端调用但仍删除 cookies", async () => {
    mockCookies.get.mockReturnValueOnce(undefined);

    const err = await catchRedirect(() => logoutAction());

    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockCookies.delete).toHaveBeenCalledWith("c_access_token");
    expect(mockCookies.delete).toHaveBeenCalledWith("c_refresh_token");
    expect(mockCookies.delete).toHaveBeenCalledWith("c_user_info");
    expect(err).not.toBeNull();
  });

  it("后端登出接口异常时仍删除 cookies 并重定向", async () => {
    mockCookies.get.mockReturnValueOnce({ name: "c_access_token", value: "c_at_123" });
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const err = await catchRedirect(() => logoutAction());

    // catch 块中再次获取 cookieStore 并删除
    expect(mockCookies.delete).toHaveBeenCalledWith("c_access_token");
    expect(mockCookies.delete).toHaveBeenCalledWith("c_refresh_token");
    expect(mockCookies.delete).toHaveBeenCalledWith("c_user_info");
    expect(err).not.toBeNull();
  });
});

describe("C端 registerAction", () => {
  it("空用户名或密码时返回错误", async () => {
    const fd = makeFormData({ username: "", password: "" });
    const result = await registerAction({ success: true, data: null }, fd);
    expect(result).toEqual({ success: false, error: "请输入账号和密码" });
  });

  it("注册成功时写入 cookies 并重定向到 /c", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "reg_at",
        refresh_token: "reg_rt",
        token_type: "bearer",
        expires_in: 1800,
        user: { nickname: "新用户", phone: "13900139000" },
      }),
    });

    const fd = makeFormData({
      username: "newuser",
      password: "Pass1234",
      nickname: "新用户",
      phone: "13900139000",
    });
    const err = await catchRedirect(() =>
      registerAction({ success: true, data: null }, fd)
    );

    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/public/auth/register",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
    );
    expect(mockCookies.set).toHaveBeenCalledWith(
      "c_access_token",
      "reg_at",
      expect.objectContaining({ maxAge: 1800 })
    );
    expect(mockCookies.set).toHaveBeenCalledWith(
      "c_refresh_token",
      "reg_rt",
      expect.objectContaining({ maxAge: 60 * 60 * 24 * 7 })
    );
    expect(err).not.toBeNull();
    expect(err!.digest).toContain("NEXT_REDIRECT;/c;replace");
  });

  it("注册失败时返回错误信息", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: "用户名已存在" }),
    });

    const fd = makeFormData({ username: "existuser", password: "Pass1234" });
    const result = await registerAction({ success: true, data: null }, fd);

    expect(result).toEqual({ success: false, error: "用户名已存在" });
  });

  it("注册失败时从 message 字段提取错误信息", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ message: "手机号格式不正确" }),
    });

    const fd = makeFormData({ username: "newuser", password: "Pass1234" });
    const result = await registerAction({ success: true, data: null }, fd);

    expect(result).toEqual({ success: false, error: "手机号格式不正确" });
  });

  it("注册失败且无明确错误字段时使用默认消息", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({}),
    });

    const fd = makeFormData({ username: "newuser", password: "Pass1234" });
    const result = await registerAction({ success: true, data: null }, fd);

    expect(result).toEqual({ success: false, error: "注册失败" });
  });

  it("注册时可选字段为空时不发送", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "reg_at",
        refresh_token: "reg_rt",
        token_type: "bearer",
        expires_in: 1800,
        user: {},
      }),
    });

    const fd = makeFormData({ username: "newuser", password: "Pass1234" });
    await catchRedirect(() =>
      registerAction({ success: true, data: null }, fd)
    );

    // 验证请求体不包含 nickname/phone
    const callBody = JSON.parse(
      (mockFetch.mock.calls[0] as unknown[])[1] as string && ((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    );
    expect(callBody).toEqual({ username: "newuser", password: "Pass1234" });
    expect(callBody).not.toHaveProperty("nickname");
    expect(callBody).not.toHaveProperty("phone");
  });

  it("网络异常时返回网络错误", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const fd = makeFormData({ username: "newuser", password: "Pass1234" });
    const result = await registerAction({ success: true, data: null }, fd);

    expect(result).toEqual({ success: false, error: "网络错误，请连接后端服务" });
  });
});
