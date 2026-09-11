import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// ─── JWT helper ──────────────────────────────────────────────────────────────
// 库 middleware 用 isTokenValid() 判断 token 是否有效（3 段 + exp 未过期），
// 测试需用 JWT 形状的 token 才能触发刷新分支。生产环境的 token 均为合法 JWT。
function makeJwt(expOffsetSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + expOffsetSeconds }),
  ).toString("base64url");
  return `${header}.${payload}.signature`;
}

// 全局复用的 JWT 形状 token，避免在每个测试中重复构造
const EXPIRED_ACCESS = makeJwt(-3600); // 1 小时前过期
const VALID_REFRESH = makeJwt(7200); // 2 小时后过期

describe("proxy admin refresh dedup", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/config");
  });

  function createRequest({
    pathname,
    cookies = {},
    accept = "text/html",
  }: {
    pathname: string;
    cookies?: Record<string, string>;
    accept?: string;
  }): NextRequest {
    const url = `http://localhost${pathname}`;
    const cookieHeader = Object.entries(cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

    return new NextRequest(url, {
      headers: {
        accept,
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
      },
    });
  }

  async function loadProxy() {
    vi.doMock("@/lib/config", () => ({
      apiPaths: { auth: { refresh: "/api/v1/auth/refresh" } },
      getApiUrl: (path: string) => `http://127.0.0.1:8000${path}`,
    }));
    const mod = await import("./proxy");
    return mod.default;
  }

  function createJsonResponse(body: unknown, status: number): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  function countRefreshCalls(fetchSpy: ReturnType<typeof vi.spyOn>): number {
    return fetchSpy.mock.calls.filter((args) => String(args[0]).includes("/api/v1/auth/refresh"))
      .length;
  }

  it("导航 + 预取同时命中刷新阈值时只发起一次后端刷新，所有请求成功", async () => {
    const proxy = await loadProxy();

    const newAccess = makeJwt(3600);
    const newRefresh = makeJwt(7200);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createJsonResponse(
        {
          access_token: newAccess,
          refresh_token: newRefresh,
          expires_in: 3600,
        },
        200,
      ),
    );

    const req1 = createRequest({
      pathname: "/admin/dashboard",
      cookies: { access_token: EXPIRED_ACCESS, refresh_token: VALID_REFRESH },
      accept: "text/html",
    });
    const req2 = createRequest({
      pathname: "/admin/projects",
      cookies: { access_token: EXPIRED_ACCESS, refresh_token: VALID_REFRESH },
      accept: "text/html",
    });

    const [r1, r2] = await Promise.all([proxy(req1), proxy(req2)]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    expect(countRefreshCalls(fetchSpy)).toBe(1);

    // 库 middleware 通过 writeTokensToResponse 写入刷新后的 token
    expect(r1.cookies.get("access_token")?.value).toBe(newAccess);
    expect(r1.cookies.get("refresh_token")?.value).toBe(newRefresh);
    expect(r2.cookies.get("access_token")?.value).toBe(newAccess);
    expect(r2.cookies.get("refresh_token")?.value).toBe(newRefresh);
  });

  it("两个 HTML 请求携带同一 refresh_token 时，admin 刷新分支去重生效", async () => {
    const proxy = await loadProxy();

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createJsonResponse(
        {
          access_token: makeJwt(3600),
          refresh_token: makeJwt(7200),
          expires_in: 3600,
        },
        200,
      ),
    );

    const req1 = createRequest({
      pathname: "/admin/users",
      cookies: { access_token: EXPIRED_ACCESS, refresh_token: VALID_REFRESH },
      accept: "text/html",
    });
    const req2 = createRequest({
      pathname: "/admin/settings",
      cookies: { access_token: EXPIRED_ACCESS, refresh_token: VALID_REFRESH },
      accept: "text/html",
    });

    const [r1, r2] = await Promise.all([proxy(req1), proxy(req2)]);

    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    expect(countRefreshCalls(fetchSpy)).toBe(1);
  });

  it("刷新返回 401 时重定向到 /admin/login 并清除 cookies", async () => {
    const proxy = await loadProxy();

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(createJsonResponse({ detail: "invalid refresh token" }, 401));

    const req = createRequest({
      pathname: "/admin/dashboard",
      cookies: { access_token: EXPIRED_ACCESS, refresh_token: VALID_REFRESH },
      accept: "text/html",
    });

    const response = await proxy(req);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/admin/login");

    expect(countRefreshCalls(fetchSpy)).toBe(1);

    // 库 middleware 的 session.redirect() 通过 clearTokensFromResponse 清除 cookies
    expect(response.cookies.get("access_token")?.value).toBe("");
    expect(response.cookies.get("refresh_token")?.value).toBe("");
  });

  it("并发 admin HTML 请求刷新 401 时均跳转 /admin/login 且只调用一次后端刷新", async () => {
    const proxy = await loadProxy();

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(createJsonResponse({ detail: "invalid refresh token" }, 401));

    const req1 = createRequest({
      pathname: "/admin/dashboard",
      cookies: { access_token: EXPIRED_ACCESS, refresh_token: VALID_REFRESH },
      accept: "text/html",
    });
    const req2 = createRequest({
      pathname: "/admin/projects",
      cookies: { access_token: EXPIRED_ACCESS, refresh_token: VALID_REFRESH },
      accept: "text/html",
    });

    const [r1, r2] = await Promise.all([proxy(req1), proxy(req2)]);

    expect(r1.status).toBe(307);
    expect(r2.status).toBe(307);
    expect(r1.headers.get("location")).toBe("http://localhost/admin/login");
    expect(r2.headers.get("location")).toBe("http://localhost/admin/login");

    expect(countRefreshCalls(fetchSpy)).toBe(1);

    expect(r1.cookies.get("access_token")?.value).toBe("");
    expect(r1.cookies.get("refresh_token")?.value).toBe("");
    expect(r2.cookies.get("access_token")?.value).toBe("");
    expect(r2.cookies.get("refresh_token")?.value).toBe("");
  });

  it("非 HTML 请求不触发 admin 刷新", async () => {
    const proxy = await loadProxy();

    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const req = createRequest({
      pathname: "/admin/dashboard",
      cookies: { access_token: EXPIRED_ACCESS, refresh_token: VALID_REFRESH },
      accept: "application/json",
    });

    const response = await proxy(req);

    expect(response.status).toBe(200);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fetch reject 时 fail-closed 跳转 /admin/login（库 middleware 刷新失败视为未认证）", async () => {
    const proxy = await loadProxy();

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("network failure"));

    const req = createRequest({
      pathname: "/admin/dashboard",
      cookies: { access_token: EXPIRED_ACCESS, refresh_token: VALID_REFRESH },
      accept: "text/html",
    });

    const response = await proxy(req);

    // 行为变更：原实现网络错误时 pass-through (200)，库 middleware fail-closed
    // 刷新失败 → access_token 仍过期 → isAuthenticated=false → redirect
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/admin/login");

    expect(countRefreshCalls(fetchSpy)).toBe(1);

    expect(response.cookies.get("access_token")?.value).toBe("");
    expect(response.cookies.get("refresh_token")?.value).toBe("");
  });
});
