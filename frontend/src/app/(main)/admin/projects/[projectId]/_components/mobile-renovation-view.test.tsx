import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import type { UsePermissionReturn } from "@/hooks/use-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";

// ─── Per-test configurable mocks (hoisted so vi.mock factories can read them) ─
const {
  mockUsePermission,
  mockGetRenovationPhotosAction,
  mockUpdateRenovationStageAction,
  mockDeleteRenovationPhotoAction,
  mockUseRenovationUpload,
} = vi.hoisted(() => ({
  mockUsePermission: vi.fn<[], UsePermissionReturn>(),
  mockGetRenovationPhotosAction: vi.fn(),
  mockUpdateRenovationStageAction: vi.fn(),
  mockDeleteRenovationPhotoAction: vi.fn(),
  mockUseRenovationUpload: vi.fn(),
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

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => React.createElement("img", { ...props }),
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

vi.mock("@/app/(main)/admin/projects/actions/client", () => ({
  getRenovationPhotosAction: mockGetRenovationPhotosAction,
}));

vi.mock("@/app/(main)/admin/projects/actions/renovation", () => ({
  updateRenovationStageAction: mockUpdateRenovationStageAction,
  deleteRenovationPhotoAction: mockDeleteRenovationPhotoAction,
}));

vi.mock(
  "@/app/(main)/admin/projects/_components/project-detail/views/renovation/components/use-renovation-upload",
  () => ({
    useRenovationUpload: mockUseRenovationUpload,
  }),
);

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

// user 角色不持有 project 子权限码，业务身份由后端 can_edit_renovation 标志决定
const USER_PERMISSIONS: string[] = [PERMISSION_CODES.PROJECT_READ];

interface ProjectLike {
  id: string;
  name: string;
  community_name?: string;
  status: string;
  renovation_stage: string;
  renovation?: { can_edit_renovation?: boolean } | null;
  renovationStageDates?: Record<string, string> | null;
}

function makeProject(overrides: Partial<ProjectLike> = {}): ProjectLike {
  return {
    id: "p1",
    name: "测试项目",
    community_name: "测试小区",
    status: "renovating",
    renovation_stage: "拆除",
    renovation: { can_edit_renovation: false },
    ...overrides,
  };
}

function makePhoto(id: string): Record<string, unknown> {
  return {
    id,
    project_id: "p1",
    stage: "拆除",
    url: "https://example.com/photo.jpg",
    thumbnail_url: "https://example.com/thumb.jpg",
    filename: "photo.jpg",
    created_at: "2024-01-01T00:00:00Z",
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MobileRenovationView - 业务身份按钮显隐", () => {
  beforeEach(() => {
    mockUsePermission.mockReset();
    mockGetRenovationPhotosAction.mockReset();
    mockUpdateRenovationStageAction.mockReset();
    mockDeleteRenovationPhotoAction.mockReset();
    mockUseRenovationUpload.mockReset();

    // 默认 mock：空照片列表 + 空上传队列
    mockGetRenovationPhotosAction.mockResolvedValue({
      success: true,
      data: [],
    });
    mockUseRenovationUpload.mockReturnValue({
      uploadQueue: [],
      handleUpload: vi.fn(),
      setUploadQueue: vi.fn(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ─── admin 角色：持有 PROJECT_WRITE → 所有按钮显示 ─────────────────────────
  it("admin 角色访问时：上传照片按钮、删除照片按钮、完成阶段按钮均显示", async () => {
    mockUsePermission.mockReturnValue(mockPermissions(ADMIN_PERMISSIONS));
    mockGetRenovationPhotosAction.mockResolvedValue({
      success: true,
      data: [makePhoto("ph1")],
    });

    const { MobileRenovationView } = await import("./mobile-renovation-view");

    render(<MobileRenovationView projectId="p1" project={makeProject()} />);

    // 等待照片加载完成
    await waitFor(() => {
      expect(screen.getByText("上传照片")).toBeInTheDocument();
    });

    // 上传按钮
    expect(screen.getByText("上传照片")).toBeInTheDocument();
    // 删除照片按钮（title 属性）
    expect(screen.getByTitle("删除照片")).toBeInTheDocument();
    // 完成阶段按钮
    expect(screen.getByText("完成阶段")).toBeInTheDocument();
  });

  // ─── operator 角色：持有 PROJECT_RENOVATION_UPLOAD_PHOTO 与 COMPLETE_STAGE ─
  it("operator 角色访问时：上传/删除照片按钮显示，完成阶段按钮显示", async () => {
    mockUsePermission.mockReturnValue(mockPermissions(OPERATOR_PERMISSIONS));
    mockGetRenovationPhotosAction.mockResolvedValue({
      success: true,
      data: [makePhoto("ph1")],
    });

    const { MobileRenovationView } = await import("./mobile-renovation-view");

    render(<MobileRenovationView projectId="p1" project={makeProject()} />);

    await waitFor(() => {
      expect(screen.getByText("上传照片")).toBeInTheDocument();
    });

    expect(screen.getByText("上传照片")).toBeInTheDocument();
    expect(screen.getByTitle("删除照片")).toBeInTheDocument();
    expect(screen.getByText("完成阶段")).toBeInTheDocument();
  });

  // ─── user 被指派为对接负责人（can_edit_renovation === true）→ 按钮显示 ──────
  it("user 被指派为对接负责人（can_edit_renovation === true）：按钮显示", async () => {
    mockUsePermission.mockReturnValue(mockPermissions(USER_PERMISSIONS));
    mockGetRenovationPhotosAction.mockResolvedValue({
      success: true,
      data: [makePhoto("ph1")],
    });

    const { MobileRenovationView } = await import("./mobile-renovation-view");

    render(
      <MobileRenovationView
        projectId="p1"
        project={makeProject({
          renovation: { can_edit_renovation: true },
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("上传照片")).toBeInTheDocument();
    });

    // user 通过业务身份标志获得权限
    expect(screen.getByText("上传照片")).toBeInTheDocument();
    expect(screen.getByTitle("删除照片")).toBeInTheDocument();
    expect(screen.getByText("完成阶段")).toBeInTheDocument();
  });

  // ─── user 无业务身份（can_edit_renovation === false）→ 按钮不渲染 ──────────
  it("user 无业务身份（can_edit_renovation === false）：按钮不渲染", async () => {
    mockUsePermission.mockReturnValue(mockPermissions(USER_PERMISSIONS));
    mockGetRenovationPhotosAction.mockResolvedValue({
      success: true,
      data: [makePhoto("ph1")],
    });

    const { MobileRenovationView } = await import("./mobile-renovation-view");

    render(
      <MobileRenovationView
        projectId="p1"
        project={makeProject({
          renovation: { can_edit_renovation: false },
        })}
      />,
    );

    // 等待组件渲染稳定（无上传按钮出现）
    await waitFor(() => {
      expect(mockGetRenovationPhotosAction).toHaveBeenCalled();
    });

    // 上传按钮不渲染
    expect(screen.queryByText("上传照片")).not.toBeInTheDocument();
    // 删除按钮不渲染
    expect(screen.queryByTitle("删除照片")).not.toBeInTheDocument();
    // 完成阶段按钮不渲染
    expect(screen.queryByText("完成阶段")).not.toBeInTheDocument();
  });

  // ─── user 持有 PROJECT_RENOVATION_UPLOAD_PHOTO 子权限码（豁免场景）→ 显示 ──
  it("user 持有 PROJECT_RENOVATION_UPLOAD_PHOTO 子权限码：上传/删除照片按钮显示", async () => {
    mockUsePermission.mockReturnValue(
      mockPermissions([
        PERMISSION_CODES.PROJECT_READ,
        PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO,
      ]),
    );
    mockGetRenovationPhotosAction.mockResolvedValue({
      success: true,
      data: [makePhoto("ph1")],
    });

    const { MobileRenovationView } = await import("./mobile-renovation-view");

    render(
      <MobileRenovationView
        projectId="p1"
        project={makeProject({
          renovation: { can_edit_renovation: false },
        })}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("上传照片")).toBeInTheDocument();
    });

    // 持有 upload_photo 子权限码 → 上传/删除按钮显示
    expect(screen.getByText("上传照片")).toBeInTheDocument();
    expect(screen.getByTitle("删除照片")).toBeInTheDocument();
    // 不持有 complete_stage 子权限码且 can_edit_renovation === false → 完成阶段按钮不渲染
    expect(screen.queryByText("完成阶段")).not.toBeInTheDocument();
  });
});
