import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

// ─── Per-test mutable state (hoisted so vi.mock factories can read them) ──────
const { mockUserState, mockPathnameState, mockRedirect } = vi.hoisted(() => ({
  mockUserState: { user: null as unknown },
  mockPathnameState: { pathname: "" },
  mockRedirect: vi.fn(),
}));

// Mock next/navigation — redirect throws sentinel to halt execution like real Next.js
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

// Mock next/headers — headers() returns Headers with current pathname
vi.mock("next/headers", () => ({
  headers: vi.fn(async () =>
    new Headers({ "x-invoke-path": mockPathnameState.pathname }),
  ),
  cookies: vi.fn(async () => ({ get: () => undefined })),
}));

// Mock @/lib/api-server — fetchClient returns client with mocked GET /api/v1/auth/me
vi.mock("@/lib/api-server", () => ({
  fetchClient: vi.fn(async () => ({
    GET: vi.fn(async () => ({
      data: mockUserState.user,
      error: null,
      response: { ok: true, status: 200 },
    })),
  })),
}));

// Mock sidebar UI components to render children directly
vi.mock("@/components/ui/sidebar", () => ({
  SidebarProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
  SidebarInset: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
  SidebarTrigger: () => null,
}));

// Mock AppSidebar to render null
vi.mock("@/components/app-sidebar", () => ({
  AppSidebar: () => null,
}));

// Mock ErrorBoundary to render children directly
vi.mock("@/components/error-boundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

describe("DashboardLayout role guard", () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockUserState.user = null;
    mockPathnameState.pathname = "";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // SubTask 6.1: RED — user role blocked on /admin/users
  it("user with role.code='user' accessing /admin/users should redirect to /admin", async () => {
    mockUserState.user = {
      username: "u",
      role: { code: "user", name: "User" },
    };
    mockPathnameState.pathname = "/admin/users";

    const { default: DashboardLayout } = await import("./layout");

    await expect(
      DashboardLayout({
        children: React.createElement("div", null, "content"),
      }),
    ).rejects.toThrow("__REDIRECT__/admin");

    expect(mockRedirect).toHaveBeenCalledWith("/admin");
  });

  // SubTask 6.2: RED — admin role passes on /admin/users
  it("user with role.code='admin' accessing /admin/users should NOT redirect, renders children", async () => {
    mockUserState.user = {
      username: "admin",
      role: { code: "admin", name: "Administrator" },
    };
    mockPathnameState.pathname = "/admin/users";

    const { default: DashboardLayout } = await import("./layout");

    const result = await DashboardLayout({
      children: React.createElement("div", null, "content"),
    });
    render(result);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  // SubTask 6.2: RED — null role blocked on /admin/users
  it("user with role=null accessing /admin/users should redirect to /admin", async () => {
    mockUserState.user = {
      username: "u",
      role: null,
    };
    mockPathnameState.pathname = "/admin/users";

    const { default: DashboardLayout } = await import("./layout");

    await expect(
      DashboardLayout({
        children: React.createElement("div", null, "content"),
      }),
    ).rejects.toThrow("__REDIRECT__/admin");

    expect(mockRedirect).toHaveBeenCalledWith("/admin");
  });

  // SubTask 6.2: RED — user role on non-restricted /admin passes
  it("user with role.code='user' accessing /admin (not restricted) should NOT redirect, renders children", async () => {
    mockUserState.user = {
      username: "u",
      role: { code: "user", name: "User" },
    };
    mockPathnameState.pathname = "/admin";

    const { default: DashboardLayout } = await import("./layout");

    const result = await DashboardLayout({
      children: React.createElement("div", null, "content"),
    });
    render(result);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  // Issue 1: 缺失路径 — /admin/properties/upload 应限制为 admin/operator
  it("user with role.code='user' accessing /admin/properties/upload should redirect to /admin", async () => {
    mockUserState.user = {
      username: "u",
      role: { code: "user", name: "User" },
    };
    mockPathnameState.pathname = "/admin/properties/upload";

    const { default: DashboardLayout } = await import("./layout");

    await expect(
      DashboardLayout({
        children: React.createElement("div", null, "content"),
      }),
    ).rejects.toThrow("__REDIRECT__/admin");

    expect(mockRedirect).toHaveBeenCalledWith("/admin");
  });

  // Issue 1: 缺失路径 — /admin/properties/governance 应限制为 admin/operator
  it("user with role.code='user' accessing /admin/properties/governance should redirect to /admin", async () => {
    mockUserState.user = {
      username: "u",
      role: { code: "user", name: "User" },
    };
    mockPathnameState.pathname = "/admin/properties/governance";

    const { default: DashboardLayout } = await import("./layout");

    await expect(
      DashboardLayout({
        children: React.createElement("div", null, "content"),
      }),
    ).rejects.toThrow("__REDIRECT__/admin");

    expect(mockRedirect).toHaveBeenCalledWith("/admin");
  });

  // Issue 1: 角色粒度 — /admin/users 应为 admin only，operator 应被拦截
  it("user with role.code='operator' accessing /admin/users should redirect to /admin (admin-only path)", async () => {
    mockUserState.user = {
      username: "op",
      role: { code: "operator", name: "Operator" },
    };
    mockPathnameState.pathname = "/admin/users";

    const { default: DashboardLayout } = await import("./layout");

    await expect(
      DashboardLayout({
        children: React.createElement("div", null, "content"),
      }),
    ).rejects.toThrow("__REDIRECT__/admin");

    expect(mockRedirect).toHaveBeenCalledWith("/admin");
  });

  // Issue 1: 正向 — operator 访问 admin/operator 路径应放行
  it("user with role.code='operator' accessing /admin/properties/upload should NOT redirect", async () => {
    mockUserState.user = {
      username: "op",
      role: { code: "operator", name: "Operator" },
    };
    mockPathnameState.pathname = "/admin/properties/upload";

    const { default: DashboardLayout } = await import("./layout");

    const result = await DashboardLayout({
      children: React.createElement("div", null, "content"),
    });
    render(result);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  // Issue 1: 正向 — operator 访问 /admin/settings/api-key 应放行
  it("user with role.code='operator' accessing /admin/settings/api-key should NOT redirect", async () => {
    mockUserState.user = {
      username: "op",
      role: { code: "operator", name: "Operator" },
    };
    mockPathnameState.pathname = "/admin/settings/api-key";

    const { default: DashboardLayout } = await import("./layout");

    const result = await DashboardLayout({
      children: React.createElement("div", null, "content"),
    });
    render(result);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  // Issue 1: 非受限路径 — /admin/leads 对所有后台角色开放（对齐 sidebar 无 roles 配置）
  it("user with role.code='user' accessing /admin/leads should NOT redirect (open to all admin roles)", async () => {
    mockUserState.user = {
      username: "u",
      role: { code: "user", name: "User" },
    };
    mockPathnameState.pathname = "/admin/leads";

    const { default: DashboardLayout } = await import("./layout");

    const result = await DashboardLayout({
      children: React.createElement("div", null, "content"),
    });
    render(result);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});
