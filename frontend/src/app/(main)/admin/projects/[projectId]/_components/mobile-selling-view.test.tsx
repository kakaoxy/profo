import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { UsePermissionReturn } from "@/hooks/use-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";

// ─── Per-test configurable mocks (hoisted so vi.mock factories can read them) ─
const {
  mockUsePermission,
  mockDeleteSalesRecordAction,
} = vi.hoisted(() => ({
  mockUsePermission: vi.fn<[], UsePermissionReturn>(),
  mockDeleteSalesRecordAction: vi.fn(),
}));

vi.mock("@/hooks/use-permission", () => ({
  usePermission: () => mockUsePermission(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(() => "toast-id"),
    dismiss: vi.fn(),
  },
}));

vi.mock("@/lib/api-server", () => ({
  fetchClient: vi.fn(),
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

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof React>("react");
  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T): T => fn,
  };
});

vi.mock("@/app/(main)/admin/projects/actions/sales", () => ({
  deleteSalesRecordAction: mockDeleteSalesRecordAction,
  createSalesRecordAction: vi.fn(),
  updateSalesRolesAction: vi.fn(),
  getSalesUsersSimpleAction: vi.fn(),
  getCurrentUserAction: vi.fn(),
}));

// Mock MobileRecordForm 以避免触发 createSalesRecordAction 链路
vi.mock("./mobile-record-form", () => ({
  MobileRecordForm: () =>
    React.createElement("div", { "data-testid": "mobile-record-form" }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockPermissions(permissions: string[]): UsePermissionReturn {
  const hasPermission = (code: string): boolean =>
    permissions.includes(code);
  const hasAnyPermission = (codes: string[]): boolean =>
    codes.some((c) => permissions.includes(c));
  return {
    permissions,
    hasPermission,
    hasAnyPermission,
    isLoading: false,
  };
}

const ADMIN_PERMISSIONS: string[] = [
  PERMISSION_CODES.PROJECT_READ,
  PERMISSION_CODES.PROJECT_WRITE,
  PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO,
  PERMISSION_CODES.PROJECT_RENOVATION_COMPLETE_STAGE,
  PERMISSION_CODES.PROJECT_SALES_ADD_RECORD,
  PERMISSION_CODES.PROJECT_SALES_MANAGE_TEAM,
];

const OPERATOR_PERMISSIONS: string[] = [
  PERMISSION_CODES.PROJECT_READ,
  PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO,
  PERMISSION_CODES.PROJECT_RENOVATION_COMPLETE_STAGE,
  PERMISSION_CODES.PROJECT_SALES_ADD_RECORD,
  PERMISSION_CODES.PROJECT_SALES_MANAGE_TEAM,
];

// user 角色不持有 project 子权限码，业务身份由后端 can_edit_sales 标志决定
const USER_PERMISSIONS: string[] = [PERMISSION_CODES.PROJECT_READ];

interface ProjectLike {
  id: string;
  name: string;
  community_name?: string;
  status: string;
  sale?: { can_edit_sales?: boolean } | null;
  sales_records?: unknown[];
  listing_date?: string | null;
}

function makeProject(
  overrides: Partial<ProjectLike> = {},
): ProjectLike {
  return {
    id: "p1",
    name: "测试项目",
    community_name: "测试小区",
    status: "selling",
    sale: { can_edit_sales: false },
    sales_records: [],
    listing_date: "2024-01-01",
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MobileSellingView - 业务身份按钮显隐", () => {
  beforeEach(() => {
    mockUsePermission.mockReset();
    mockDeleteSalesRecordAction.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── admin 角色：持有 PROJECT_WRITE → 新增记录按钮显示 ──────────────────────
  it("admin 角色访问时：新增带看记录按钮显示", async () => {
    mockUsePermission.mockReturnValue(mockPermissions(ADMIN_PERMISSIONS));

    const { MobileSellingView } = await import("./mobile-selling-view");

    render(<MobileSellingView projectId="p1" project={makeProject()} />);

    // 默认 activeTab = "viewing"，按钮文本 = "新增带看记录"
    expect(screen.getByText("新增带看记录")).toBeInTheDocument();
  });

  // ─── operator 角色：持有 PROJECT_SALES_ADD_RECORD → 新增记录按钮显示 ───────
  it("operator 角色访问时：新增带看记录按钮显示", async () => {
    mockUsePermission.mockReturnValue(mockPermissions(OPERATOR_PERMISSIONS));

    const { MobileSellingView } = await import("./mobile-selling-view");

    render(<MobileSellingView projectId="p1" project={makeProject()} />);

    expect(screen.getByText("新增带看记录")).toBeInTheDocument();
  });

  // ─── user 被指派为销售团队成员（can_edit_sales === true）→ 按钮显示 ─────────
  it("user 被指派为销售团队成员（can_edit_sales === true）：按钮显示", async () => {
    mockUsePermission.mockReturnValue(mockPermissions(USER_PERMISSIONS));

    const { MobileSellingView } = await import("./mobile-selling-view");

    render(
      <MobileSellingView
        projectId="p1"
        project={makeProject({ sale: { can_edit_sales: true } })}
      />,
    );

    expect(screen.getByText("新增带看记录")).toBeInTheDocument();
  });

  // ─── user 无业务身份（can_edit_sales === false）→ 按钮不渲染 ────────────────
  it("user 无业务身份（can_edit_sales === false）：按钮不渲染", async () => {
    mockUsePermission.mockReturnValue(mockPermissions(USER_PERMISSIONS));

    const { MobileSellingView } = await import("./mobile-selling-view");

    render(
      <MobileSellingView
        projectId="p1"
        project={makeProject({ sale: { can_edit_sales: false } })}
      />,
    );

    // 按钮不渲染
    expect(screen.queryByText("新增带看记录")).not.toBeInTheDocument();
    expect(screen.queryByText("新增出价记录")).not.toBeInTheDocument();
    expect(screen.queryByText("新增面谈记录")).not.toBeInTheDocument();
  });

  // ─── user 持有 PROJECT_SALES_ADD_RECORD 子权限码 → 按钮显示 ─────────────────
  it("user 持有 PROJECT_SALES_ADD_RECORD 子权限码：新增记录按钮显示", async () => {
    mockUsePermission.mockReturnValue(
      mockPermissions([
        PERMISSION_CODES.PROJECT_READ,
        PERMISSION_CODES.PROJECT_SALES_ADD_RECORD,
      ]),
    );

    const { MobileSellingView } = await import("./mobile-selling-view");

    render(
      <MobileSellingView
        projectId="p1"
        project={makeProject({ sale: { can_edit_sales: false } })}
      />,
    );

    expect(screen.getByText("新增带看记录")).toBeInTheDocument();
  });

  // ─── 项目非 selling 状态：按钮不渲染（即使有权限） ─────────────────────────
  it("项目非 selling 状态（如 sold）时：新增记录按钮不渲染", async () => {
    mockUsePermission.mockReturnValue(mockPermissions(ADMIN_PERMISSIONS));

    const { MobileSellingView } = await import("./mobile-selling-view");

    render(
      <MobileSellingView
        projectId="p1"
        project={makeProject({ status: "sold" })}
      />,
    );

    expect(screen.queryByText("新增带看记录")).not.toBeInTheDocument();
  });
});
