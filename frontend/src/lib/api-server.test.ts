import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createServer } from "node:http";

// 保存测试开始前的原生 fetch：其他用例会替换 globalThis.fetch 且 afterEach
// 不会自动还原直接赋值，真实 socket 用例必须显式恢复，否则会调用到上一个 mock。
const nativeFetch = globalThis.fetch;

describe("api-server fetchClient", () => {
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    globalThis.fetch = nativeFetch;
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

  // 生产 #441（2026-10-29）：uvicorn worker 被回收时连接被对端关闭，Server
  // Component 的 GET 抛 `TypeError: fetch failed`。GET/HEAD 应短暂重试，
  // 非幂等请求绝不能重试（可能已写库）。
  it("GET 遇到瞬时网络错误时自动重试并成功", async () => {
    vi.resetModules();

    vi.doMock("next/headers", () => serverActionHeadersMock("valid-token"));

    vi.doMock("./token-refresh-server", () => ({
      getAccessTokenFromCookie: vi.fn().mockResolvedValue("valid-token"),
      forceRefreshToken: vi.fn().mockResolvedValue("refreshed-token"),
    }));

    const transientError = Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }),
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(transientError)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
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

    vi.doUnmock("next/headers");
    vi.doUnmock("./token-refresh-server");
  });

  it("真实 socket 被对端关闭时 GET 自动重试（复现生产 #441 错误形态）", async () => {
    vi.resetModules();

    vi.doMock("next/headers", () => serverActionHeadersMock("valid-token"));
    vi.doMock("./token-refresh-server", () => ({
      getAccessTokenFromCookie: vi.fn().mockResolvedValue("valid-token"),
      forceRefreshToken: vi.fn().mockResolvedValue("refreshed-token"),
    }));

    let requestCount = 0;
    const server = createServer((request, response) => {
      requestCount += 1;
      if (requestCount === 1) {
        // 模拟 uvicorn worker 被回收：连接被对端直接关闭（UND_ERR_SOCKET）。
        request.socket.destroy();
        return;
      }
      response.writeHead(200, {
        "Content-Type": "application/json",
        Connection: "close",
      });
      response.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("测试 HTTP server 未返回 TCP 地址");
    }

    const originalServerApiUrl = process.env.SERVER_API_URL;
    process.env.SERVER_API_URL = `http://127.0.0.1:${address.port}`;
    globalThis.fetch = nativeFetch;

    try {
      const { fetchClient } = await import("./api-server");
      const client = await fetchClient();
      const { response } = await client.GET("/api/v1/auth/me" as never);

      expect(response.status).toBe(200);
      expect(requestCount).toBe(2);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
      if (originalServerApiUrl === undefined) {
        delete process.env.SERVER_API_URL;
      } else {
        process.env.SERVER_API_URL = originalServerApiUrl;
      }
      vi.doUnmock("next/headers");
      vi.doUnmock("./token-refresh-server");
    }
  });

  it("非幂等请求遇到瞬时网络错误时不重试", async () => {
    vi.resetModules();

    vi.doMock("next/headers", () => serverActionHeadersMock("valid-token"));

    vi.doMock("./token-refresh-server", () => ({
      getAccessTokenFromCookie: vi.fn().mockResolvedValue("valid-token"),
      forceRefreshToken: vi.fn().mockResolvedValue("refreshed-token"),
    }));

    const transientError = Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }),
    });
    const fetchMock = vi.fn().mockRejectedValue(transientError);
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const { fetchClient } = await import("./api-server");
    const client = await fetchClient();

    await expect(client.POST("/api/v1/auth/login" as never, {} as never)).rejects.toThrow(
      "fetch failed",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.doUnmock("next/headers");
    vi.doUnmock("./token-refresh-server");
  });

  it("非连接类 fetch 错误不视为可重试网络错误", async () => {
    const { isTransientNetworkError } = await import("./api-server");

    const certificateError = Object.assign(new TypeError("fetch failed"), {
      cause: Object.assign(new Error("certificate has expired"), { code: "CERT_HAS_EXPIRED" }),
    });

    expect(isTransientNetworkError(certificateError)).toBe(false);
    expect(isTransientNetworkError(new Error("ordinary error"))).toBe(false);
    expect(
      isTransientNetworkError(
        Object.assign(new TypeError("fetch failed"), {
          cause: Object.assign(new Error("other side closed"), { code: "UND_ERR_SOCKET" }),
        }),
      ),
    ).toBe(true);
  });

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
