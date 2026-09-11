import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

function createCookieStore() {
  const store = new Map<string, { value: string }>();
  return {
    get: vi.fn((name: string) => store.get(name)),
    set: vi.fn((name: string, value: string) => store.set(name, { value })),
    delete: vi.fn((name: string) => store.delete(name)),
    _store: store,
  };
}

/**
 * 构造传给 POST/GET 的 Request 对象。
 *
 * Task 8.2: route 现在读取 request.url 解析 `?next=` 参数，并通过
 * request.headers.get("accept") 判断返回方式（HTML 303 跳转 vs JSON）。
 * 旧测试直接调用 POST() 不传参数，新代码会因 request.url 抛错。
 */
function createRequest(
  options: {
    method?: "POST" | "GET";
    next?: string;
    accept?: string;
    requestedWith?: string;
  } = {},
): Request {
  const url = new URL("http://localhost:3000/api/auth/refresh");
  if (options.next) url.searchParams.set("next", options.next);

  const headers = new Headers();
  if (options.accept) headers.set("accept", options.accept);
  if (options.requestedWith) headers.set("x-requested-with", options.requestedWith);

  return new Request(url.toString(), {
    method: options.method ?? "POST",
    headers,
  });
}

async function loadRoute(cookieStore: ReturnType<typeof createCookieStore>) {
  vi.doMock("next/headers", () => ({
    cookies: vi.fn().mockResolvedValue(cookieStore),
  }));
  vi.doMock("@/lib/config", () => ({
    apiPaths: { auth: { refresh: "/api/v1/auth/refresh" } },
    getApiUrl: (path: string) => `http://127.0.0.1:8000${path}`,
  }));
  const mod = await import("./route");
  return mod;
}

function createJsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/auth/refresh", () => {
  beforeEach(() => {
    vi.resetModules();
    // 清空 dedupServerRefresh 挂在 globalThis 的去重注册表：
    // vi.resetModules 只重置模块缓存，globalThis 上的注册表会跨用例存活，
    // 前序失败用例缓存的 rejected Promise 会让后续成功用例拿到 401（假失败）
    delete (globalThis as { __authServerRefreshPromises?: unknown }).__authServerRefreshPromises;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("next/headers");
    vi.doUnmock("@/lib/config");
  });

  it("后端返回 401 时清除 access_token 与 refresh_token cookies（fail-closed 统一 401）", async () => {
    const cookieStore = createCookieStore();
    cookieStore.set("refresh_token", "old-refresh");
    cookieStore.set("access_token", "old-access");

    const { POST } = await loadRoute(cookieStore);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createJsonResponse({ detail: "invalid refresh token" }, 401),
    );

    const response = await POST(createRequest());

    expect(response.status).toBe(401);
    expect(cookieStore.delete).toHaveBeenCalledWith("access_token");
    expect(cookieStore.delete).toHaveBeenCalledWith("refresh_token");
  });

  it("后端返回 403 时 fail-closed 清除 cookies 并返回 401", async () => {
    const cookieStore = createCookieStore();
    cookieStore.set("refresh_token", "old-refresh");
    cookieStore.set("access_token", "old-access");

    const { POST } = await loadRoute(cookieStore);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createJsonResponse({ detail: "forbidden" }, 403),
    );

    const response = await POST(createRequest());

    // 行为变更：原实现返回 403，新实现 fail-closed 统一返回 401
    // （adminAuth.adapter.refreshToken 抛错，route 不再区分状态码）
    expect(response.status).toBe(401);
    expect(cookieStore.delete).toHaveBeenCalledWith("access_token");
    expect(cookieStore.delete).toHaveBeenCalledWith("refresh_token");
  });

  it("后端返回 500 时视为瞬时失败：保留 cookies 并返回 503 可重试", async () => {
    const cookieStore = createCookieStore();
    cookieStore.set("refresh_token", "old-refresh");
    cookieStore.set("access_token", "old-access");

    const { POST } = await loadRoute(cookieStore);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createJsonResponse({ detail: "internal error" }, 500),
    );

    const response = await POST(createRequest());

    // 行为变更：仅后端明确拒绝（401/403）才 fail-closed 清 cookie 并 401；
    // 5xx 属瞬时失败，保留 cookie 返回 503，让客户端按可重试错误处理，
    // 避免后端抖动把仍有效的会话误杀
    expect(response.status).toBe(503);
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it("刷新成功时通过 setTokenCookies 设置新的 access_token 与 refresh_token cookies", async () => {
    const cookieStore = createCookieStore();
    cookieStore.set("refresh_token", "old-refresh");

    const { POST } = await loadRoute(cookieStore);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createJsonResponse(
        {
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 3600,
        },
        200,
      ),
    );

    const response = await POST(createRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    // [安全修复] 路由仅返回 { success: true }，token 不暴露到 JS 可读响应体
    expect(json).toEqual({ success: true });
    // setTokenCookies(adminAuth.config) 写入 cookie，maxAge 从 exp claim 读取
    expect(cookieStore.set).toHaveBeenCalledWith("access_token", "new-access", expect.any(Object));
    expect(cookieStore.set).toHaveBeenCalledWith(
      "refresh_token",
      "new-refresh",
      expect.any(Object),
    );
  });

  // ─── Task 8.2: ?next= 参数处理测试 ──────────────────────────────────────

  it("Task 8.2: 刷新成功 + ?next=/admin + HTML 请求 → 303 重定向到 /admin", async () => {
    const cookieStore = createCookieStore();
    cookieStore.set("refresh_token", "old-refresh");

    const { POST } = await loadRoute(cookieStore);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createJsonResponse(
        {
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 3600,
        },
        200,
      ),
    );

    const response = await POST(createRequest({ next: "/admin", accept: "text/html" }));

    // 303 重定向（POST → GET 语义），浏览器带上新 cookie 重新加载原页面
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("http://localhost:3000/admin");
    // cookie 仍应被写入
    expect(cookieStore.set).toHaveBeenCalledWith("access_token", "new-access", expect.any(Object));
  });

  it("Task 8.2: 刷新成功 + ?next=/admin + AJAX 请求 → JSON 含 redirect 字段", async () => {
    const cookieStore = createCookieStore();
    cookieStore.set("refresh_token", "old-refresh");

    const { POST } = await loadRoute(cookieStore);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createJsonResponse(
        {
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 3600,
        },
        200,
      ),
    );

    const response = await POST(createRequest({ next: "/admin", accept: "application/json" }));
    const json = await response.json();

    // 不触发 303 跳转，由客户端 JS 自行决定是否跳转/重试
    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, redirect: "/admin" });
  });

  it("Task 8.2: 刷新成功 + ?next=//evil.com（不安全路径）→ 忽略 next，返回 { success: true }", async () => {
    const cookieStore = createCookieStore();
    cookieStore.set("refresh_token", "old-refresh");

    const { POST } = await loadRoute(cookieStore);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createJsonResponse(
        {
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 3600,
        },
        200,
      ),
    );

    const response = await POST(createRequest({ next: "//evil.com", accept: "text/html" }));
    const json = await response.json();

    // sanitizeCallbackUrl 拒绝 `//evil.com`（协议相对 URL，open redirect 风险）
    // next 被忽略，走无 next 分支，返回 { success: true } 不触发跳转
    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true });
    expect(response.headers.get("Location")).toBeNull();
  });

  it("Task 8.2: 刷新成功 + ?next=https://evil.com（绝对 URL）→ 忽略 next，返回 { success: true }", async () => {
    const cookieStore = createCookieStore();
    cookieStore.set("refresh_token", "old-refresh");

    const { POST } = await loadRoute(cookieStore);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createJsonResponse(
        {
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 3600,
        },
        200,
      ),
    );

    const response = await POST(createRequest({ next: "https://evil.com", accept: "text/html" }));
    const json = await response.json();

    // sanitizeCallbackUrl 仅允许 root-relative 路径，绝对 URL 被拒绝
    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true });
    expect(response.headers.get("Location")).toBeNull();
  });

  it("Task 8.2: 刷新成功 + 无 next 参数 → 保持旧行为 { success: true }", async () => {
    const cookieStore = createCookieStore();
    cookieStore.set("refresh_token", "old-refresh");

    const { POST } = await loadRoute(cookieStore);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createJsonResponse(
        {
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 3600,
        },
        200,
      ),
    );

    const response = await POST(createRequest());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true });
    expect(response.headers.get("Location")).toBeNull();
  });

  it("Task 8.2: 刷新成功 + ?next=/admin/leads + X-Requested-With=XMLHttpRequest → JSON 含 redirect", async () => {
    const cookieStore = createCookieStore();
    cookieStore.set("refresh_token", "old-refresh");

    const { POST } = await loadRoute(cookieStore);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createJsonResponse(
        {
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 3600,
        },
        200,
      ),
    );

    const response = await POST(
      createRequest({
        next: "/admin/leads",
        requestedWith: "XMLHttpRequest",
      }),
    );
    const json = await response.json();

    // X-Requested-With: XMLHttpRequest 也被视为 AJAX 请求，返回 JSON
    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, redirect: "/admin/leads" });
  });
});

describe("GET /api/auth/refresh", () => {
  beforeEach(() => {
    vi.resetModules();
    // 同 POST：清空 globalThis 上的刷新去重注册表，保证用例隔离
    delete (globalThis as { __authServerRefreshPromises?: unknown }).__authServerRefreshPromises;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("next/headers");
    vi.doUnmock("@/lib/config");
  });

  it("无 refresh_token cookie → 303 重定向到 /admin/login + 清 cookie", async () => {
    const cookieStore = createCookieStore();
    // 不设置 refresh_token

    const { GET } = await loadRoute(cookieStore);

    const response = await GET(
      createRequest({ method: "GET", next: "/admin/properties/governance" }),
    );

    expect(response.status).toBe(303);
    // 登录 URL 携带 ?redirect=next：重新登录后回跳原页面（登录重定向持久化）
    expect(response.headers.get("Location")).toBe(
      "http://localhost:3000/admin/login?redirect=%2Fadmin%2Fproperties%2Fgovernance",
    );
    // 清 cookie（fail-closed，避免半失效状态）
    expect(cookieStore.delete).toHaveBeenCalledWith("access_token");
    expect(cookieStore.delete).toHaveBeenCalledWith("refresh_token");
  });

  it("刷新失败（后端 401）→ 303 重定向到 /admin/login + 清 cookie（fail-closed）", async () => {
    const cookieStore = createCookieStore();
    cookieStore.set("refresh_token", "old-refresh");
    cookieStore.set("access_token", "old-access");

    const { GET } = await loadRoute(cookieStore);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createJsonResponse({ detail: "invalid refresh token" }, 401),
    );

    const response = await GET(
      createRequest({ method: "GET", next: "/admin/properties/governance" }),
    );

    expect(response.status).toBe(303);
    // 登录 URL 携带 ?redirect=next：重新登录后回跳原页面（登录重定向持久化）
    expect(response.headers.get("Location")).toBe(
      "http://localhost:3000/admin/login?redirect=%2Fadmin%2Fproperties%2Fgovernance",
    );
    expect(cookieStore.delete).toHaveBeenCalledWith("access_token");
    expect(cookieStore.delete).toHaveBeenCalledWith("refresh_token");
  });

  it("刷新成功 + ?next=/admin/properties/governance → 303 重定向到该路径 + setTokenCookies 被调用", async () => {
    const cookieStore = createCookieStore();
    cookieStore.set("refresh_token", "old-refresh");

    const { GET } = await loadRoute(cookieStore);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createJsonResponse(
        {
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 3600,
        },
        200,
      ),
    );

    const response = await GET(
      createRequest({ method: "GET", next: "/admin/properties/governance" }),
    );

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      "http://localhost:3000/admin/properties/governance",
    );
    // 新 token 落盘到 cookie
    expect(cookieStore.set).toHaveBeenCalledWith("access_token", "new-access", expect.any(Object));
    expect(cookieStore.set).toHaveBeenCalledWith(
      "refresh_token",
      "new-refresh",
      expect.any(Object),
    );
  });

  it("刷新成功 + 无 next 参数 → 303 重定向到 /admin（回退默认值）", async () => {
    const cookieStore = createCookieStore();
    cookieStore.set("refresh_token", "old-refresh");

    const { GET } = await loadRoute(cookieStore);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createJsonResponse(
        {
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 3600,
        },
        200,
      ),
    );

    const response = await GET(createRequest({ method: "GET" }));

    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("http://localhost:3000/admin");
  });

  it("刷新成功 + ?next=//evil.com（不安全路径）→ 303 重定向到 /admin（sanitizeCallbackUrl 拒绝）", async () => {
    const cookieStore = createCookieStore();
    cookieStore.set("refresh_token", "old-refresh");

    const { GET } = await loadRoute(cookieStore);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createJsonResponse(
        {
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 3600,
        },
        200,
      ),
    );

    const response = await GET(createRequest({ method: "GET", next: "//evil.com" }));

    // sanitizeCallbackUrl 拒绝 `//evil.com`（协议相对 URL，open redirect 风险）
    // next 回退到 /admin
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("http://localhost:3000/admin");
  });

  it("刷新成功 + ?next=https://evil.com（绝对 URL）→ 303 重定向到 /admin", async () => {
    const cookieStore = createCookieStore();
    cookieStore.set("refresh_token", "old-refresh");

    const { GET } = await loadRoute(cookieStore);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      createJsonResponse(
        {
          access_token: "new-access",
          refresh_token: "new-refresh",
          expires_in: 3600,
        },
        200,
      ),
    );

    const response = await GET(createRequest({ method: "GET", next: "https://evil.com" }));

    // sanitizeCallbackUrl 仅允许 root-relative 路径，绝对 URL 被拒绝
    // next 回退到 /admin
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe("http://localhost:3000/admin");
  });
});
