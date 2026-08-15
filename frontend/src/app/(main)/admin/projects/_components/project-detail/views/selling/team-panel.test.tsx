import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import type { UsePermissionReturn } from "@/hooks/use-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";

// ─── Per-test configurable mocks (hoisted so vi.mock factories can read them) ─
const { mockUsePermission, mockGetSalesUsersSimpleAction, mockUpdateSalesRolesAction } = vi.hoisted(
  () => ({
    mockUsePermission: vi.fn<[], UsePermissionReturn>(),
    mockGetSalesUsersSimpleAction: vi.fn(),
    mockUpdateSalesRolesAction: vi.fn(),
  }),
);

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
  getSalesUsersSimpleAction: mockGetSalesUsersSimpleAction,
  updateSalesRolesAction: mockUpdateSalesRolesAction,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockPermissions(permissions: string[]): UsePermissionReturn {
  const hasPermission = (code: string): boolean => permissions.includes(code);
  const hasAnyPermission = (codes: string[]): boolean => codes.some((c) => permissions.includes(c));
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
  PERMISSION_CODES.PROJECT_SALES_MANAGE_TEAM,
];

const OPERATOR_PERMISSIONS: string[] = [
  PERMISSION_CODES.PROJECT_READ,
  PERMISSION_CODES.PROJECT_SALES_MANAGE_TEAM,
];

// user 角色不持有 manage_team 权限，团队 Select 应只读
const USER_PERMISSIONS: string[] = [PERMISSION_CODES.PROJECT_READ];

interface ProjectLike {
  id: string;
  name: string;
  channel_manager_id?: string;
  property_agent_id?: string;
  negotiator_id?: string;
}

function makeProject(overrides: Partial<ProjectLike> = {}): ProjectLike {
  return {
    id: "p1",
    name: "测试项目",
    channel_manager_id: "",
    property_agent_id: "",
    negotiator_id: "",
    ...overrides,
  };
}

function makeUser(id: string, nickname: string) {
  return { id, nickname, username: nickname };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("SalesTeamPanel - 销售团队 Select 控件权限", () => {
  beforeEach(() => {
    mockUsePermission.mockReset();
    mockGetSalesUsersSimpleAction.mockReset();
    mockUpdateSalesRolesAction.mockReset();

    // 默认 mock：返回空用户列表
    mockGetSalesUsersSimpleAction.mockResolvedValue({
      success: true,
      data: [],
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── user 角色：无 manage_team 权限 → Select 只读（ReadOnlyMember） ────────
  it("user 角色访问（无 project:sales:manage_team 权限）：Select 只读，渲染 ReadOnlyMember", async () => {
    mockUsePermission.mockReturnValue(mockPermissions(USER_PERMISSIONS));

    const { SalesTeamPanel } = await import("./team-panel");

    render(
      <SalesTeamPanel
        project={makeProject() as React.ComponentProps<typeof SalesTeamPanel>["project"]}
      />,
    );

    // 等待用户列表加载完成
    await waitFor(() => {
      expect(mockGetSalesUsersSimpleAction).toHaveBeenCalled();
    });

    // 三组销售团队 Select 均不渲染（无 combobox 角色）
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    // 三组均显示 ReadOnlyMember 的 "未设置" 文本（channel_manager_id 等为空）
    const notSetElements = screen.getAllByText("未设置");
    expect(notSetElements).toHaveLength(3);
  });

  // ─── admin 角色：持有 manage_team 权限 → Select 可编辑 ─────────────────────
  it("admin 角色访问（持有 project:sales:manage_team 权限）：Select 可编辑", async () => {
    mockUsePermission.mockReturnValue(mockPermissions(ADMIN_PERMISSIONS));

    const { SalesTeamPanel } = await import("./team-panel");

    render(
      <SalesTeamPanel
        project={makeProject() as React.ComponentProps<typeof SalesTeamPanel>["project"]}
      />,
    );

    // 等待 Select trigger 渲染（Radix Select trigger 是 combobox）
    await waitFor(() => {
      expect(screen.getAllByRole("combobox")).toHaveLength(3);
    });

    // 三组 Select trigger 均渲染
    expect(screen.getAllByRole("combobox")).toHaveLength(3);
    // Select placeholder 文本存在
    expect(screen.getByText("选择渠道负责人")).toBeInTheDocument();
    expect(screen.getByText("选择讲房人")).toBeInTheDocument();
    expect(screen.getByText("选择谈判人")).toBeInTheDocument();
  });

  // ─── operator 角色：持有 manage_team 权限 → Select 可编辑 ──────────────────
  it("operator 角色访问（持有 project:sales:manage_team 权限）：Select 可编辑", async () => {
    mockUsePermission.mockReturnValue(mockPermissions(OPERATOR_PERMISSIONS));

    const { SalesTeamPanel } = await import("./team-panel");

    render(
      <SalesTeamPanel
        project={makeProject() as React.ComponentProps<typeof SalesTeamPanel>["project"]}
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByRole("combobox")).toHaveLength(3);
    });

    expect(screen.getAllByRole("combobox")).toHaveLength(3);
  });

  // ─── user 角色 + 已指派团队成员 → ReadOnlyMember 显示用户名 ─────────────────
  it("user 角色访问且已指派团队成员：ReadOnlyMember 显示用户名（只读）", async () => {
    mockUsePermission.mockReturnValue(mockPermissions(USER_PERMISSIONS));
    mockGetSalesUsersSimpleAction.mockResolvedValue({
      success: true,
      data: [makeUser("u1", "张三"), makeUser("u2", "李四"), makeUser("u3", "王五")],
    });

    const { SalesTeamPanel } = await import("./team-panel");

    render(
      <SalesTeamPanel
        project={
          makeProject({
            channel_manager_id: "u1",
            property_agent_id: "u2",
            negotiator_id: "u3",
          }) as React.ComponentProps<typeof SalesTeamPanel>["project"]
        }
      />,
    );

    // 等待用户列表加载完成，ReadOnlyMember 显示用户名
    await waitFor(() => {
      expect(screen.getByText("张三")).toBeInTheDocument();
    });

    // 三组均显示对应用户名（只读）
    expect(screen.getByText("张三")).toBeInTheDocument();
    expect(screen.getByText("李四")).toBeInTheDocument();
    expect(screen.getByText("王五")).toBeInTheDocument();
    // 不渲染 Select 控件
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
  });

  // ─── 加载中状态：显示 "加载中..." 文本 ─────────────────────────────────────
  it("user 角色访问且用户列表加载中：ReadOnlyMember 显示 '加载中...'", async () => {
    mockUsePermission.mockReturnValue(mockPermissions(USER_PERMISSIONS));
    // 不让 promise resolve，保持 isLoading=true
    mockGetSalesUsersSimpleAction.mockReturnValue(new Promise(() => {}));

    const { SalesTeamPanel } = await import("./team-panel");

    render(
      <SalesTeamPanel
        project={makeProject() as React.ComponentProps<typeof SalesTeamPanel>["project"]}
      />,
    );

    // 三组均显示 "加载中..."
    const loadingElements = screen.getAllByText("加载中...");
    expect(loadingElements).toHaveLength(3);
    // 不渲染 Select
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
  });
});
