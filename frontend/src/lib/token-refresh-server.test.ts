import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("refreshTokenServer", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should log [ERROR] Token 刷新失败 when refresh endpoint returns non-ok", async () => {
    vi.doMock("next/headers", () => ({
      cookies: vi.fn().mockResolvedValue({
        get: vi.fn().mockImplementation((name: string) => {
          if (name === "refresh_token") return { value: "refresh-token" };
          return undefined;
        }),
        set: vi.fn(),
      }),
    }));

    vi.doMock("./config", () => ({
      apiPaths: { auth: { refresh: "/api/v1/auth/refresh" } },
      getApiUrl: (path: string) => `http://127.0.0.1:8000${path}`,
    }));

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({ detail: "invalid refresh token" }),
    } as unknown as Response);

    const { refreshTokenServer } = await import("./token-refresh-server");
    const result = await refreshTokenServer();

    expect(result).toBeNull();
    // adminAuth.adapter.refreshToken 抛 ApiStatusError（extractApiError 提取后端
    // message，并携带 HTTP 状态码供 isDefinitiveRejection 分类），
    // logger.error 将 Error 序列化为 { name, message } 后输出。
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[ERROR\] Token 刷新失败/),
      expect.objectContaining({ name: "ApiStatusError", message: expect.any(String) }),
    );

    vi.doUnmock("next/headers");
    vi.doUnmock("./config");
  });
});
