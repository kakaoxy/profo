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
  headers: vi.fn(async () => new Headers({ "x-invoke-path": mockPathnameState.pathname })),
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

describe("DashboardLayout permission guard", () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockUserState.user = null;
    mockPathnameState.pathname = "";
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // /admin/users → 需 user:read 权限
  it("user without user:read permission accessing /admin/users should redirect to /admin", async () => {
    mockUserState.user = {
      username: "u",
      permissions: [],
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

  it("user with user:read permission accessing /admin/users should NOT redirect, renders children", async () => {
    mockUserState.user = {
      username: "admin",
      permissions: ["user:read"],
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

  it("user with permissions=null accessing /admin/users should redirect to /admin", async () => {
    mockUserState.user = {
      username: "u",
      permissions: null,
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

  it("user with undefined permissions accessing /admin/users should redirect to /admin", async () => {
    mockUserState.user = {
      username: "u",
      // permissions 字段缺失，模拟 gen-api 未同步的 UserResponse
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

  // 非受限路径 — /admin 对所有后台用户开放
  it("user with empty permissions accessing /admin (not restricted) should NOT redirect, renders children", async () => {
    mockUserState.user = {
      username: "u",
      permissions: [],
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

  // /admin/properties/upload → 需 property:upload 权限
  it("user without property:upload permission accessing /admin/properties/upload should redirect to /admin", async () => {
    mockUserState.user = {
      username: "u",
      permissions: [],
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

  it("user with property:upload permission accessing /admin/properties/upload should NOT redirect", async () => {
    mockUserState.user = {
      username: "op",
      permissions: ["property:upload"],
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

  // /admin/properties/governance → 需 property:governance 权限
  it("user without property:governance permission accessing /admin/properties/governance should redirect to /admin", async () => {
    mockUserState.user = {
      username: "u",
      permissions: [],
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

  // 权限粒度：持有 user:read 但不持有 property:upload，访问上传页应被拦截
  it("user with user:read but without property:upload accessing /admin/properties/upload should redirect", async () => {
    mockUserState.user = {
      username: "admin",
      permissions: ["user:read"],
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

  // /admin/settings → 需 api_key:manage 权限
  it("user with api_key:manage permission accessing /admin/settings/api-key should NOT redirect", async () => {
    mockUserState.user = {
      username: "op",
      permissions: ["api_key:manage"],
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

  // 非受限路径 — /admin/leads 对所有后台用户开放
  it("user with empty permissions accessing /admin/leads should NOT redirect (open to all admin roles)", async () => {
    mockUserState.user = {
      username: "u",
      permissions: [],
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

  // /admin/properties/governance → 需 property:governance 权限（正向用例）
  it("user with property:governance permission accessing /admin/properties/governance should NOT redirect", async () => {
    mockUserState.user = {
      username: "op",
      permissions: ["property:governance"],
    };
    mockPathnameState.pathname = "/admin/properties/governance";

    const { default: DashboardLayout } = await import("./layout");

    const result = await DashboardLayout({
      children: React.createElement("div", null, "content"),
    });
    render(result);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  // /admin/audit-logs → 需 operation_log:read 权限（反向用例）
  it("user without operation_log:read permission accessing /admin/audit-logs should redirect to /admin", async () => {
    mockUserState.user = {
      username: "u",
      permissions: [],
    };
    mockPathnameState.pathname = "/admin/audit-logs";

    const { default: DashboardLayout } = await import("./layout");

    await expect(
      DashboardLayout({
        children: React.createElement("div", null, "content"),
      }),
    ).rejects.toThrow("__REDIRECT__/admin");

    expect(mockRedirect).toHaveBeenCalledWith("/admin");
  });

  // /admin/audit-logs → 需 operation_log:read 权限（正向用例）
  it("user with operation_log:read permission accessing /admin/audit-logs should NOT redirect", async () => {
    mockUserState.user = {
      username: "admin",
      permissions: ["operation_log:read"],
    };
    mockPathnameState.pathname = "/admin/audit-logs";

    const { default: DashboardLayout } = await import("./layout");

    const result = await DashboardLayout({
      children: React.createElement("div", null, "content"),
    });
    render(result);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  // /admin/settings → 需 api_key:manage 权限（反向用例）
  it("user without api_key:manage permission accessing /admin/settings should redirect to /admin", async () => {
    mockUserState.user = {
      username: "u",
      permissions: ["user:read"],
    };
    mockPathnameState.pathname = "/admin/settings";

    const { default: DashboardLayout } = await import("./layout");

    await expect(
      DashboardLayout({
        children: React.createElement("div", null, "content"),
      }),
    ).rejects.toThrow("__REDIRECT__/admin");

    expect(mockRedirect).toHaveBeenCalledWith("/admin");
  });

  // ─── Task 14: /admin/projects 路径权限守卫（需 project:read 权限） ─────────
  it("user without project:read permission accessing /admin/projects should redirect to /admin", async () => {
    mockUserState.user = {
      username: "u",
      permissions: [],
    };
    mockPathnameState.pathname = "/admin/projects";

    const { default: DashboardLayout } = await import("./layout");

    await expect(
      DashboardLayout({
        children: React.createElement("div", null, "content"),
      }),
    ).rejects.toThrow("__REDIRECT__/admin");

    expect(mockRedirect).toHaveBeenCalledWith("/admin");
  });

  it("user with project:read permission accessing /admin/projects should NOT redirect, renders children", async () => {
    mockUserState.user = {
      username: "admin",
      permissions: ["project:read"],
    };
    mockPathnameState.pathname = "/admin/projects";

    const { default: DashboardLayout } = await import("./layout");

    const result = await DashboardLayout({
      children: React.createElement("div", null, "content"),
    });
    render(result);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  it("user without project:read permission accessing /admin/projects/123 (child path) should redirect to /admin", async () => {
    mockUserState.user = {
      username: "u",
      permissions: ["user:read"],
    };
    mockPathnameState.pathname = "/admin/projects/123";

    const { default: DashboardLayout } = await import("./layout");

    await expect(
      DashboardLayout({
        children: React.createElement("div", null, "content"),
      }),
    ).rejects.toThrow("__REDIRECT__/admin");

    expect(mockRedirect).toHaveBeenCalledWith("/admin");
  });

  it("user with project:read permission accessing /admin/projects/123/renovation should NOT redirect", async () => {
    mockUserState.user = {
      username: "user",
      permissions: ["project:read"],
    };
    mockPathnameState.pathname = "/admin/projects/123/renovation";

    const { default: DashboardLayout } = await import("./layout");

    const result = await DashboardLayout({
      children: React.createElement("div", null, "content"),
    });
    render(result);

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(screen.getByText("content")).toBeInTheDocument();
  });

  // 权限粒度：持有 user:read 但不持有 project:read，访问项目页应被拦截
  it("user with user:read but without project:read accessing /admin/projects should redirect", async () => {
    mockUserState.user = {
      username: "admin",
      permissions: ["user:read"],
    };
    mockPathnameState.pathname = "/admin/projects";

    const { default: DashboardLayout } = await import("./layout");

    await expect(
      DashboardLayout({
        children: React.createElement("div", null, "content"),
      }),
    ).rejects.toThrow("__REDIRECT__/admin");

    expect(mockRedirect).toHaveBeenCalledWith("/admin");
  });

  it("user with permissions=null accessing /admin/projects should redirect to /admin", async () => {
    mockUserState.user = {
      username: "u",
      permissions: null,
    };
    mockPathnameState.pathname = "/admin/projects";

    const { default: DashboardLayout } = await import("./layout");

    await expect(
      DashboardLayout({
        children: React.createElement("div", null, "content"),
      }),
    ).rejects.toThrow("__REDIRECT__/admin");

    expect(mockRedirect).toHaveBeenCalledWith("/admin");
  });
});
