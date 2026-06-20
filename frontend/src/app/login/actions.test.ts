import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMockCookies } from "@/test/server-action-helpers";
import { loginAction, changePasswordAction, logoutAction } from "./actions";

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
    auth: { token: "/api/v1/auth/token", refresh: "/api/v1/auth/refresh" },
    users: { changePassword: "/api/v1/users/change-password" },
  },
  getApiUrl: (path: string) => `http://127.0.0.1:8000${path}`,
}));

vi.mock("@/lib/logger", () => ({
  createActionLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    devDebug: vi.fn(),
  }),
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
  // 重置 mockCookies 内部状态
  mockCookies.set.mockClear();
  mockCookies.get.mockClear();
  mockCookies.delete.mockClear();
});

describe("loginAction", () => {
  it("空用户名或密码时返回错误", async () => {
    const fd = makeFormData({ username: "", password: "" });
    const result = await loginAction(null, fd);
    expect(result).toEqual({ error: "请输入账号和密码" });
  });

  it("登录成功时写入 cookies 并重定向到首页", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: "at_123",
        refresh_token: "rt_456",
        token_type: "bearer",
        expires_in: 1800,
      }),
    });

    const fd = makeFormData({ username: "admin", password: "Fdd123.." });
    const err = await catchRedirect(() => loginAction(null, fd));

    // 验证 fetch 被正确调用
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/auth/token",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      })
    );

    // 验证 cookies 被设置
    expect(mockCookies.set).toHaveBeenCalledWith(
      "access_token",
      "at_123",
      expect.objectContaining({ maxAge: 1800, httpOnly: true, path: "/" })
    );
    expect(mockCookies.set).toHaveBeenCalledWith(
      "refresh_token",
      "rt_456",
      expect.objectContaining({ maxAge: 60 * 60 * 24 * 7, httpOnly: true, path: "/" })
    );

    // 验证重定向
    expect(err).not.toBeNull();
    expect(err!.digest).toContain("NEXT_REDIRECT;/;replace");
  });

  it("密码错误时返回错误信息", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        error: { message: "用户名或密码错误" },
      }),
    });

    const fd = makeFormData({ username: "admin", password: "wrong" });
    const result = await loginAction(null, fd);

    expect(result).toEqual({ error: "用户名或密码错误" });
    expect(mockCookies.set).not.toHaveBeenCalled();
  });

  it("首次登录 403 时返回 mustChangePassword 和 tempToken", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        error: {
          code: "HTTP_403",
          message: {
            temp_token: "tmp_token_abc",
            code: "HTTP_403",
          },
        },
      }),
    });

    const fd = makeFormData({ username: "newuser", password: "Fdd123.." });
    const result = await loginAction(null, fd);

    expect(result).toEqual({
      mustChangePassword: true,
      username: "newuser",
      tempToken: "tmp_token_abc",
    });
    expect(mockCookies.set).not.toHaveBeenCalled();
  });

  it("403 但无法提取 temp_token 时返回系统错误", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        error: { code: "HTTP_403", message: "首次登录需修改密码" },
      }),
    });

    const fd = makeFormData({ username: "newuser", password: "Fdd123.." });
    const result = await loginAction(null, fd);

    expect(result).toEqual({ error: "系统错误：未获取到修改密码凭证" });
  });

  it("后端返回 JSON 包含'首次登录'时也触发强制改密", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({
        detail: "首次登录需修改密码",
        temp_token: "tmp_from_root",
      }),
    });

    const fd = makeFormData({ username: "newuser2", password: "Fdd123.." });
    const result = await loginAction(null, fd);

    expect(result).toEqual({
      mustChangePassword: true,
      username: "newuser2",
      tempToken: "tmp_from_root",
    });
  });

  it("网络异常时返回网络错误", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const fd = makeFormData({ username: "admin", password: "Fdd123.." });
    const result = await loginAction(null, fd);

    expect(result).toEqual({ error: "网络错误，请连接后端服务" });
  });

  it("后端返回非 JSON 时不会崩溃", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => { throw new Error("invalid json"); },
    });

    const fd = makeFormData({ username: "admin", password: "Fdd123.." });
    const result = await loginAction(null, fd);

    expect(result).toEqual({ error: "登录失败" });
  });

  it("errorObj.message 为字符串时直接使用该消息", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: "请求参数错误" },
      }),
    });

    const fd = makeFormData({ username: "admin", password: "Fdd123.." });
    const result = await loginAction(null, fd);

    expect(result).toEqual({ error: "请求参数错误" });
  });
});

describe("changePasswordAction", () => {
  it("新密码少于 8 位时返回错误并保持改密状态", async () => {
    const fd = makeFormData({
      username: "newuser",
      current_password: "old",
      new_password: "short",
      temp_token: "tmp_abc",
    });
    const result = await changePasswordAction(null, fd);

    expect(result).toEqual({
      error: "新密码长度至少需要 8 位",
      mustChangePassword: true,
      username: "newuser",
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("使用 tempToken 修改密码成功", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const fd = makeFormData({
      username: "newuser",
      current_password: "OldPass123",
      new_password: "NewPass456",
      temp_token: "tmp_abc",
    });
    const result = await changePasswordAction(null, fd);

    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/users/change-password",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer tmp_abc",
        },
      })
    );
    expect(result).toEqual({ error: undefined });
  });

  it("无 tempToken 时从 cookie 获取 access_token", async () => {
    mockCookies.get.mockReturnValueOnce({ name: "access_token", value: "cookie_at" });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const fd = makeFormData({
      username: "admin",
      current_password: "OldPass123",
      new_password: "NewPass456",
      temp_token: "",
    });
    const result = await changePasswordAction(null, fd);

    expect(mockCookies.get).toHaveBeenCalledWith("access_token");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/users/change-password",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer cookie_at",
        },
      })
    );
    expect(result).toEqual({ error: undefined });
  });

  it("修改密码失败时返回错误并保持改密状态", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => ({ detail: "旧密码不正确" }),
    });

    const fd = makeFormData({
      username: "newuser",
      current_password: "wrong",
      new_password: "NewPass456",
      temp_token: "tmp_abc",
    });
    const result = await changePasswordAction(null, fd);

    expect(result).toEqual({
      error: "旧密码不正确",
      mustChangePassword: true,
      username: "newuser",
    });
  });

  it("修改密码接口返回非 JSON 时使用默认错误消息", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      json: async () => { throw new Error("invalid json"); },
    });

    const fd = makeFormData({
      username: "newuser",
      current_password: "old",
      new_password: "NewPass456",
      temp_token: "tmp_abc",
    });
    const result = await changePasswordAction(null, fd);

    expect(result).toEqual({
      error: "修改密码失败",
      mustChangePassword: true,
      username: "newuser",
    });
  });

  it("无 tempToken 且 cookie 中无 access_token 时不带 Authorization 头", async () => {
    mockCookies.get.mockReturnValueOnce(undefined);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}),
    });

    const fd = makeFormData({
      username: "admin",
      current_password: "OldPass123",
      new_password: "NewPass456",
      temp_token: "",
    });
    const result = await changePasswordAction(null, fd);

    expect(mockCookies.get).toHaveBeenCalledWith("access_token");
    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8000/api/v1/users/change-password",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
          // 无 token 时不带 Authorization
        },
      })
    );
    // 确认 headers 中没有 Authorization
    const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(callArgs[1].headers).not.toHaveProperty("Authorization");
    expect(result).toEqual({ error: undefined });
  });

  it("网络异常时返回请求失败", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const fd = makeFormData({
      username: "newuser",
      current_password: "old",
      new_password: "NewPass456",
      temp_token: "tmp_abc",
    });
    const result = await changePasswordAction(null, fd);

    expect(result).toEqual({
      error: "请求失败，请稍后重试",
      mustChangePassword: true,
      username: "newuser",
    });
  });
});

describe("logoutAction", () => {
  it("删除 cookies 并重定向到登录页", async () => {
    const err = await catchRedirect(() => logoutAction());

    expect(mockCookies.delete).toHaveBeenCalledWith("access_token");
    expect(mockCookies.delete).toHaveBeenCalledWith("refresh_token");
    expect(err).not.toBeNull();
    expect(err!.digest).toContain("NEXT_REDIRECT;/login;replace");
  });
});
