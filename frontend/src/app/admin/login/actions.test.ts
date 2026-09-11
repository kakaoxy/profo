// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { LoginState } from "./actions";

// ─── Per-test mutable state (hoisted so vi.mock factories can read them) ──────
const { mockRedirect, mockCookieStore } = vi.hoisted(() => ({
  mockRedirect: vi.fn(),
  mockCookieStore: {
    get: vi.fn(),
    set: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock next/navigation — redirect throws sentinel to halt execution like real Next.js
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    mockRedirect(path);
    throw new Error(`__REDIRECT__${path}`);
  },
}));

// Mock next/headers — cookies() returns shared cookie store with delete spy
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

// Mock logger to keep test output pristine
vi.mock("@/lib/logger", () => ({
  createActionLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    devDebug: vi.fn(),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeFormData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) {
    fd.set(k, v);
  }
  return fd;
}

function makeOkResponse(body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ok: true,
    headers: { "Content-Type": "application/json" },
  });
}

function makeErrorResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    ok: false,
    headers: { "Content-Type": "application/json" },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("changePasswordAction", () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockCookieStore.get.mockClear();
    mockCookieStore.set.mockClear();
    mockCookieStore.delete.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("成功：清空 access_token/refresh_token cookie 并 redirect 到 /admin/login", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(makeOkResponse({})) as unknown as typeof fetch;

    const { changePasswordAction } = await import("./actions");

    const formData = makeFormData({
      username: "admin",
      current_password: "OldPass123!",
      new_password: "NewPass1234!",
      temp_token: "temp-token-xyz",
    });

    // redirect 会抛出哨兵错误中止执行
    await expect(changePasswordAction(null, formData)).rejects.toThrow("__REDIRECT__/admin/login");

    // access_token / refresh_token cookie 被删除
    expect(mockCookieStore.delete).toHaveBeenCalledWith(
      expect.objectContaining({ name: "access_token", path: "/" }),
    );
    expect(mockCookieStore.delete).toHaveBeenCalledWith(
      expect.objectContaining({ name: "refresh_token", path: "/" }),
    );

    // redirect 被调用
    expect(mockRedirect).toHaveBeenCalledWith("/admin/login");
  });

  it("失败：返回 success:false + error，不清 cookie、不 redirect", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        makeErrorResponse(400, { code: 400, message: "密码错误" }),
      ) as unknown as typeof fetch;

    const { changePasswordAction } = await import("./actions");

    const formData = makeFormData({
      username: "admin",
      current_password: "WrongPass",
      new_password: "NewPass1234!",
      temp_token: "temp-token-xyz",
    });

    const result = await changePasswordAction(null, formData);

    expect(result).toEqual({
      success: false,
      error: "密码错误",
      mustChangePassword: true,
      username: "admin",
    });

    expect(mockCookieStore.delete).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("失败：新密码长度不足 8 位时返回 success:false 校验错误", async () => {
    const { changePasswordAction } = await import("./actions");

    const formData = makeFormData({
      username: "admin",
      current_password: "OldPass123!",
      new_password: "short",
      temp_token: "temp-token-xyz",
    });

    const result = await changePasswordAction(null, formData);

    expect(result).toEqual({
      success: false,
      error: "密码至少 8 个字符",
      mustChangePassword: true,
      username: "admin",
    });

    expect(mockCookieStore.delete).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});

describe("loginAction", () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockCookieStore.get.mockClear();
    mockCookieStore.set.mockClear();
    mockCookieStore.delete.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("returns error when backend response is malformed", async () => {
    // mock fetch to return 200 OK with invalid body
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeOkResponse({ foo: "bar" }), // missing access_token/refresh_token
    ) as unknown as typeof fetch;

    const { loginAction } = await import("./actions");
    // 提供有效账号密码以通过早期校验，真正到达响应解析路径
    const formData = makeFormData({ username: "admin", password: "pass" });
    const result = await loginAction({} as LoginState, formData);

    expect(result).toEqual({ error: "登录响应格式异常" });
    expect(mockCookieStore.set).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
