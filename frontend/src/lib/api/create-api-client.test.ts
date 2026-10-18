// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 统一浏览器端 API 客户端工厂单测（spec D15 四类行为）。
 *
 * 覆盖：
 * 1. 并发 401 只刷新一次，各自重试成功（refresh 去重）
 * 2. 刷新瞬时失败（retryable）不跳登录页，返回原 401 响应
 * 3. 会话确定性失效 → 整页跳转登录页且带 redirect 参数
 * 4. 401 重试时重放请求体（POST body 不丢）
 * 5. 身份登记：admin/customer 端点解析显式、默认 customer（无 pathname 嗅探）
 */

vi.mock("../config", () => ({ getClientApiUrl: () => "https://api.test" }));

const REFRESH = "https://api.test/api/auth/c/refresh";
const LOGIN_PATH = "/login";

interface FetchPlan {
  /** 对应请求第 n 次（从 1 开始）返回的状态码；默认 200 */
  statuses?: number[];
  /** 响应体 */
  body?: unknown;
}

type Call = { url: string; method: string; body: string | undefined };

function installFetch(plans: Record<string, FetchPlan>): Call[] {
  const calls: Call[] = [];
  const counts = new Map<string, number>();

  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = request.url;
    calls.push({ url, method: request.method, body: await request.clone().text() });

    // 刷新端点
    if (url.includes("/api/auth")) {
      const attempt = (counts.get("refresh") ?? 0) + 1;
      counts.set("refresh", attempt);
      const plan = plans.refresh ?? {};
      const status = plan.statuses?.[attempt - 1] ?? 200;
      return new Response(JSON.stringify(plan.body ?? {}), { status });
    }

    // 业务端点
    const key = new URL(url).pathname;
    const attempt = (counts.get(key) ?? 0) + 1;
    counts.set(key, attempt);
    const plan = plans[key] ?? {};
    const status = plan.statuses?.[attempt - 1] ?? 200;
    return new Response(JSON.stringify(plan.body ?? { ok: true }), { status });
  });

  return calls;
}

/** 安装可写 window.location 桩（node 环境无 window） */
function installWindow(pathname: string) {
  const location = { pathname, href: "" };
  Object.defineProperty(globalThis, "window", {
    value: { location },
    configurable: true,
    writable: true,
  });
  return location;
}

async function loadFactory() {
  vi.resetModules();
  const mod = await import("./create-api-client");
  return mod;
}

describe("createApiClient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    // 清理 refresh-dedup 的 endpoint 缓存（模块级单例，跨用例隔离）
    delete (globalThis as { window?: unknown }).window;
  });

  it("并发 401 只触发一次刷新，两个请求都重试成功", async () => {
    const calls = installFetch({
      "/api/v1/a": { statuses: [401, 200] },
      "/api/v1/b": { statuses: [401, 200] },
    });
    const { createApiClient } = await loadFactory();
    const client = createApiClient({
      refreshEndpoint: () => REFRESH,
      loginPath: () => LOGIN_PATH,
    });

    const [a, b] = await Promise.all([client.GET("/api/v1/a"), client.GET("/api/v1/b")]);

    expect(a.response.status).toBe(200);
    expect(b.response.status).toBe(200);
    const refreshCalls = calls.filter((call) => call.url.includes("/api/auth"));
    expect(refreshCalls).toHaveLength(1);
    expect(refreshCalls[0]?.method).toBe("POST");
  });

  it("刷新瞬时失败（503）不跳登录页，返回原 401 响应", async () => {
    const location = installWindow("/admin/users");
    installFetch({
      "/api/v1/c": { statuses: [401] },
      refresh: { statuses: [503] },
    });
    const { createApiClient } = await loadFactory();
    const client = createApiClient({
      refreshEndpoint: () => REFRESH,
      loginPath: () => "/admin/login",
    });

    const result = await client.GET("/api/v1/c");

    expect(result.response.status).toBe(401);
    expect(location.href).toBe("");
  });

  it("会话确定性失效 → 跳转登录页并带 redirect 参数", async () => {
    const location = installWindow("/admin/users");
    installFetch({
      "/api/v1/d": { statuses: [401] },
      refresh: { statuses: [401] },
    });
    const { createApiClient } = await loadFactory();
    const client = createApiClient({
      refreshEndpoint: () => REFRESH,
      loginPath: () => "/admin/login",
    });

    await client.GET("/api/v1/d");

    expect(location.href).toBe(`/admin/login?redirect=${encodeURIComponent("/admin/users")}`);
  });

  it("已在登录页时不重复跳转（避免 redirect 自引用循环）", async () => {
    const location = installWindow("/login");
    installFetch({
      "/api/v1/e": { statuses: [401] },
      refresh: { statuses: [401] },
    });
    const { createApiClient } = await loadFactory();
    const client = createApiClient({
      refreshEndpoint: () => REFRESH,
      loginPath: () => LOGIN_PATH,
    });

    await client.GET("/api/v1/e");

    expect(location.href).toBe("");
  });

  it("401 重试时重放请求体（POST body 不丢）", async () => {
    const calls = installFetch({
      "/api/v1/f": { statuses: [401, 200] },
    });
    const { createApiClient } = await loadFactory();
    const client = createApiClient({
      refreshEndpoint: () => REFRESH,
      loginPath: () => LOGIN_PATH,
    });

    const payload = { label: "抖音直播" };
    await client.POST("/api/v1/f" as never, { body: payload } as never);

    const businessCalls = calls.filter((call) => new URL(call.url).pathname === "/api/v1/f");
    expect(businessCalls).toHaveLength(2);
    expect(businessCalls[0]?.method).toBe("POST");
    expect(businessCalls[1]?.method).toBe("POST");
    expect(businessCalls[1]?.body).toBe(JSON.stringify(payload));
  });

  it("命中刷新端点自身的 401 不触发递归刷新", async () => {
    // 刷新端点解析为业务 URL 的子串：该请求 401 时必须直接放行
    const calls = installFetch({ "/api/v1/h": { statuses: [401] } });
    const { createApiClient } = await loadFactory();
    const client = createApiClient({
      refreshEndpoint: () => "/api/v1/h",
      loginPath: () => LOGIN_PATH,
    });

    const { response } = await client.GET("/api/v1/h" as never);

    expect(response.status).toBe(401);
    expect(calls.filter((call) => call.url.includes("/api/auth"))).toHaveLength(0);
  });
});

describe("会话身份登记（替代 pathname 嗅探）", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("默认 customer 语义；登记 admin 后切换为后台端点", async () => {
    const identity = await import("./session-identity");

    expect(identity.resolveAuthEndpoints()).toEqual({
      refreshEndpoint: "/api/auth/c/refresh",
      loginPath: "/login",
    });

    identity.setSessionIdentity("admin");
    expect(identity.getSessionIdentity()).toBe("admin");
    expect(identity.resolveAuthEndpoints()).toEqual({
      refreshEndpoint: "/api/auth/refresh",
      loginPath: "/admin/login",
    });

    identity.setSessionIdentity("customer");
    expect(identity.resolveAuthEndpoints().refreshEndpoint).toBe("/api/auth/c/refresh");
  });
});
