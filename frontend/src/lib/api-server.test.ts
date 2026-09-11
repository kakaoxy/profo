import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("api-server fetchClient", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  // Task 8: 构造 Server Action 上下文的 headers mock（含 next-action 头）。
  // 现有测试均模拟 Server Action 场景（可写 cookie，走 forceRefreshToken 重试）。
  function serverActionHeadersMock(cookieValue: string) {
    return {
      cookies: vi.fn().mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: cookieValue }),
      }),
      headers: vi.fn().mockResolvedValue(new Headers({ "next-action": "action-id" })),
    };
  }

  it("should log warning with [WARN] prefix on 401 response", async () => {
    vi.doMock("next/headers", () => serverActionHeadersMock("valid-token"));

    vi.doMock("./token-refresh-server", () => ({
      getAccessTokenFromCookie: vi.fn().mockResolvedValue("valid-token"),
      forceRefreshToken: vi.fn().mockResolvedValue("refreshed-token"),
    }));

    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 401,
      ok: false,
      headers: new Headers({ "Content-Type": "application/json" }),
      text: vi.fn().mockResolvedValue(""),
    } as unknown as Response);

    const { fetchClient } = await import("./api-server");
    const client = await fetchClient();
    await client.GET("/api/v1/auth/me" as never);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/^\[WARN\] 检测到 401/),
      expect.anything(),
    );

    vi.doUnmock("next/headers");
    vi.doUnmock("./token-refresh-server");
  });

  it("should refresh token via forceRefreshToken and retry with new token on 401", async () => {
    vi.resetModules();

    vi.doMock("next/headers", () => serverActionHeadersMock("expired-token"));

    vi.doMock("./token-refresh-server", () => ({
      getAccessTokenFromCookie: vi.fn().mockResolvedValue("expired-token"),
      forceRefreshToken: vi.fn().mockResolvedValue("new-token"),
    }));

    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { fetchClient } = await import("./api-server");
    const client = await fetchClient();
    const { response } = await client.GET("/api/v1/auth/me" as never);

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const secondCallInit = fetchMock.mock.calls[1][1] as RequestInit;
    const secondCallHeaders = secondCallInit.headers as Record<string, string>;
    expect(secondCallHeaders.Authorization).toBe("Bearer new-token");

    vi.doUnmock("next/headers");
    vi.doUnmock("./token-refresh-server");
  });

  it("should return 401 without retry when forceRefreshToken returns null", async () => {
    vi.resetModules();

    vi.doMock("next/headers", () => serverActionHeadersMock("expired-token"));

    vi.doMock("./token-refresh-server", () => ({
      getAccessTokenFromCookie: vi.fn().mockResolvedValue("expired-token"),
      forceRefreshToken: vi.fn().mockResolvedValue(null),
    }));

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { fetchClient } = await import("./api-server");
    const client = await fetchClient();
    const { response } = await client.GET("/api/v1/auth/me" as never);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(response.status).toBe(401);

    vi.doUnmock("next/headers");
    vi.doUnmock("./token-refresh-server");
  });

  // ─── Task 8: Server Component 上下文 401 重定向测试 ────────────────────────
  // Server Component 渲染（无 next-action 头）无法写 cookie，fetchClient 应
  // redirect("/api/auth/refresh?next=<path>") 而非调用 forceRefreshToken。
  it("Task 8: Server Component 上下文 401 时 redirect 到 /api/auth/refresh?next=<path>，不调用 forceRefreshToken", async () => {
    vi.resetModules();

    // 捕获 redirect 调用参数，并抛出类似 Next.js NEXT_REDIRECT 的错误以中止后续执行
    const redirectCalls: string[] = [];
    const NEXT_REDIRECT_ERROR = Object.assign(new Error("NEXT_REDIRECT"), {
      digest: "NEXT_REDIRECT;replace;/api/auth/refresh?next=%2Fadmin%2Fdashboard;303",
    });

    vi.doMock("next/navigation", () => ({
      redirect: (path: string) => {
        redirectCalls.push(path);
        throw NEXT_REDIRECT_ERROR;
      },
    }));

    // Server Component 上下文：headers() 不含 next-action 头，但含 x-pathname
    vi.doMock("next/headers", () => ({
      cookies: vi.fn().mockResolvedValue({
        get: vi.fn().mockReturnValue({ value: "expired-token" }),
      }),
      headers: vi.fn().mockResolvedValue(new Headers({ "x-pathname": "/admin/dashboard" })),
    }));

    const forceRefreshTokenSpy = vi.fn();
    vi.doMock("./token-refresh-server", () => ({
      getAccessTokenFromCookie: vi.fn().mockResolvedValue("expired-token"),
      forceRefreshToken: forceRefreshTokenSpy,
    }));

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const { fetchClient } = await import("./api-server");
    const client = await fetchClient();

    // fetchClient.GET 内部 redirect() 抛 NEXT_REDIRECT，由上层 await 捕获
    await expect(client.GET("/api/v1/auth/me" as never)).rejects.toThrow(NEXT_REDIRECT_ERROR);

    // 验证 redirect 被调用，URL 含 next 参数指向当前路径
    expect(redirectCalls).toHaveLength(1);
    expect(redirectCalls[0]).toBe("/api/auth/refresh?next=%2Fadmin%2Fdashboard");

    // Server Component 上下文不应调用 forceRefreshToken
    // （后端 rotation 撤销旧 refresh_token 后无法落盘新 token，会导致登出）
    expect(forceRefreshTokenSpy).not.toHaveBeenCalled();

    vi.doUnmock("next/navigation");
    vi.doUnmock("next/headers");
    vi.doUnmock("./token-refresh-server");
  });
});
