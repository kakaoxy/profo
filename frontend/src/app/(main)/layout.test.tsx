import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import DashboardLayout from "./layout";

// ─── Per-test mutable state (hoisted so vi.mock factories can read them) ──────
const { mockFetchClient, mockGet, mockHeaderState, mockRedirect } = vi.hoisted(() => ({
  mockFetchClient: vi.fn(),
  mockGet: vi.fn(),
  mockHeaderState: { headers: {} as Record<string, string> },
  mockRedirect: vi.fn(),
}));

// Mock next/navigation — redirect 抛哨兵错误中断渲染，与真实 Next.js 行为一致
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    mockRedirect(path);
    throw new Error(`__REDIRECT__${path}`);
  },
  useRouter: () => ({
    replace: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  }),
}));

// Mock next/headers — `x-pathname` 由 proxy.ts（middleware）注入；
// Next.js 16 已移除框架自动注入的 `x-invoke-path` / `x-pathname`
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers(mockHeaderState.headers)),
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

vi.mock("@/lib/api-server", () => ({
  fetchClient: (...args: unknown[]) => mockFetchClient(...args),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    devDebug: vi.fn(),
  },
}));

// ─── 子组件 mock ──────────────────────────────────────────────────────────────
// 本文件只覆盖 layout 自身的「会话解析 + 降级渲染」分支。
// 路径权限拦截已迁至 Client Component PermissionGuard
// （Next.js 16 下 Server Component 读不到 pathname），
// 对应用例见 src/components/permission-guard.test.tsx。
vi.mock("@/components/permission-guard", () => ({
  PermissionGuard: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/app-sidebar", () => ({ AppSidebar: () => null }));

vi.mock("@/components/admin-mobile-tab-bar", () => ({ AdminMobileTabBar: () => null }));

vi.mock("@/components/error-boundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  SidebarInset: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** /api/v1/auth/me 成功响应 */
function meOk(data: unknown) {
  return { data, error: null, response: { ok: true, status: 200 } };
}

/** /api/v1/auth/me 失败响应（error 非空 + 指定 HTTP 状态码） */
function meFail(status: number) {
  return { data: null, error: { detail: `HTTP ${status}` }, response: { ok: false, status } };
}

/**
 * 构造 NEXT_REDIRECT 错误。
 * fetchClient 在 Server Component 上下文遇到 401 时会 redirect 到刷新路由，
 * 抛出该形态的错误；layout 必须原样放行，交由 Next.js 完成 303 跳转。
 */
function nextRedirectError(path: string) {
  return Object.assign(new Error("NEXT_REDIRECT"), {
    digest: `NEXT_REDIRECT;replace;${path};307;`,
  });
}

const CHILDREN = React.createElement("div", null, "content");

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("DashboardLayout — 会话解析与降级渲染", () => {
  beforeEach(() => {
    mockFetchClient.mockResolvedValue({ GET: mockGet });
    mockGet.mockResolvedValue(meOk({ username: "admin", permissions: ["user:read"] }));
    mockHeaderState.headers = { "x-pathname": "/admin" };
    mockRedirect.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── 会话确定性失效（401/403）→ 重定向登录页并透传原始路径 ──────────────────
  it("会话失效（401）→ 重定向 /admin/login 并透传原始路径", async () => {
    mockHeaderState.headers = { "x-pathname": "/admin/properties" };
    mockGet.mockResolvedValue(meFail(401));

    await expect(DashboardLayout({ children: CHILDREN })).rejects.toThrow(
      "__REDIRECT__/admin/login?redirect=%2Fadmin%2Fproperties",
    );
    expect(mockRedirect).toHaveBeenCalledWith("/admin/login?redirect=%2Fadmin%2Fproperties");
  });

  it("账号已禁用（403）→ 同样重定向登录页", async () => {
    mockHeaderState.headers = { "x-pathname": "/admin/users" };
    mockGet.mockResolvedValue(meFail(403));

    await expect(DashboardLayout({ children: CHILDREN })).rejects.toThrow("__REDIRECT__");
    expect(mockRedirect).toHaveBeenCalledWith("/admin/login?redirect=%2Fadmin%2Fusers");
  });

  it("proxy 未注入 x-pathname 时 → redirect 参数回退为 /admin", async () => {
    mockHeaderState.headers = {};
    mockGet.mockResolvedValue(meFail(401));

    await expect(DashboardLayout({ children: CHILDREN })).rejects.toThrow("__REDIRECT__");
    expect(mockRedirect).toHaveBeenCalledWith("/admin/login?redirect=%2Fadmin");
  });

  // ─── NEXT_REDIRECT 守卫：fetchClient 的 401 刷新跳转必须原样抛出 ────────────
  it("fetchClient 抛出 NEXT_REDIRECT → 原样放行（既不跳登录页也不渲染错误态）", async () => {
    mockFetchClient.mockRejectedValue(nextRedirectError("/api/auth/refresh?next=%2Fadmin"));

    await expect(DashboardLayout({ children: CHILDREN })).rejects.toMatchObject({
      digest: "NEXT_REDIRECT;replace;/api/auth/refresh?next=%2Fadmin;307;",
    });
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  // ─── 429 限流 → 渲染限流提示，用户仍处于认证态，不登出 ─────────────────────
  it("429 限流 → 渲染「请求过于频繁」，不重定向", async () => {
    mockGet.mockResolvedValue(meFail(429));

    render(await DashboardLayout({ children: CHILDREN }));

    expect(screen.getByText("请求过于频繁")).toBeInTheDocument();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  // ─── 5xx / 网络异常 → 渲染可重试错误态，不误判为登出 ──────────────────────
  it("5xx 服务端错误 → 渲染「服务暂时不可用」，不重定向", async () => {
    mockGet.mockResolvedValue(meFail(500));

    render(await DashboardLayout({ children: CHILDREN }));

    expect(screen.getByText("服务暂时不可用")).toBeInTheDocument();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("fetchClient 抛网络异常（后端未启动）→ 渲染「服务暂时不可用」，不重定向", async () => {
    mockFetchClient.mockRejectedValue(new Error("ECONNREFUSED"));

    render(await DashboardLayout({ children: CHILDREN }));

    expect(screen.getByText("服务暂时不可用")).toBeInTheDocument();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  // ─── 会话正常 → 渲染子页面 ────────────────────────────────────────────────
  it("会话正常 → 渲染 children，不重定向", async () => {
    mockHeaderState.headers = { "x-pathname": "/admin/users" };

    render(await DashboardLayout({ children: CHILDREN }));

    expect(screen.getByText("content")).toBeInTheDocument();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
