import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { PermissionGuard } from "./permission-guard";

// ─── Per-test configurable mocks (hoisted so vi.mock factories can read them) ─
const { mockUsePermission, mockUsePathnameState, mockRouter } = vi.hoisted(() => ({
  mockUsePermission: vi.fn(),
  mockUsePathnameState: { pathname: "" },
  mockRouter: {
    replace: vi.fn(),
    refresh: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
  },
}));

vi.mock("@/hooks/use-permission", () => ({
  usePermission: () => mockUsePermission(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mockUsePathnameState.pathname,
  useRouter: () => mockRouter,
}));

// ─── 权限码别名（避免用例表里出现裸字符串） ──────────────────────────────────
const {
  USER_READ,
  PROPERTY_READ,
  PROPERTY_UPLOAD,
  PROPERTY_GOVERNANCE,
  OPERATION_LOG_READ,
  API_KEY_MANAGE,
  LEAD_READ,
  LEAD_WRITE,
  PROJECT_READ,
  LEDGER_READ,
  L4_MARKETING_READ,
  INVESTMENT_READ,
} = PERMISSION_CODES;

// ─── 路径权限矩阵 ─────────────────────────────────────────────────────────────
// 期望值来自 `PATH_PERMISSION_MAP` / `hasPathPermission` 的现行语义：
//   · 按 prefix 长度降序命中第一个匹配项；`exact: true` 仅精确匹配、不含子路径
//   · 未登记的路径（如 /admin、/admin/leads 之外的开放页）对所有后台角色开放
//   · 无任何权限码 → 受限路径一律拦截
//   · /admin/projects/{id} 详情页刻意放行（exact 仅拦列表页），由后端
//     「业务身份双通道」校验，普通用户可进入自己负责的项目详情

interface GuardCase {
  pathname: string;
  permissions: string[];
  note: string;
}

/** 命中受限路径但未持有对应权限码 → 应重定向 /admin */
const DENIED: GuardCase[] = [
  { pathname: "/admin/users", permissions: [], note: "无权限码" },
  { pathname: "/admin/users", permissions: [PROPERTY_READ], note: "权限粒度不足（非 user:read）" },
  { pathname: "/admin/properties/upload", permissions: [], note: "无权限码" },
  {
    pathname: "/admin/properties/upload",
    permissions: [PROPERTY_READ],
    note: "详情读权限不能进上传页",
  },
  { pathname: "/admin/properties/upload", permissions: [USER_READ], note: "权限粒度隔离" },
  {
    pathname: "/admin/properties/governance",
    permissions: [PROPERTY_READ],
    note: "治理页需 property:governance",
  },
  { pathname: "/admin/audit-logs", permissions: [], note: "无权限码" },
  { pathname: "/admin/settings", permissions: [USER_READ], note: "设置页需 api_key:manage" },
  { pathname: "/admin/settings/api-key", permissions: [], note: "无权限码" },
  { pathname: "/admin/projects", permissions: [], note: "列表页无权限码" },
  { pathname: "/admin/projects", permissions: [USER_READ], note: "列表页需 project:read" },
  { pathname: "/admin/leads", permissions: [], note: "线索中心需 lead:read" },
  { pathname: "/admin/leads/new", permissions: [USER_READ], note: "录入页需 lead:write" },
  { pathname: "/admin/ledger", permissions: [], note: "资金账本需 ledger:read" },
  { pathname: "/admin/marketing", permissions: [USER_READ], note: "市场营销需 l4_marketing:read" },
  { pathname: "/admin/investments", permissions: [], note: "跟投管理需 investment:read" },
];

/** 具备所需权限码，或落在开放路径 → 不重定向 */
const ALLOWED: GuardCase[] = [
  { pathname: "/admin", permissions: [], note: "工作台对所有后台角色开放" },
  { pathname: "/admin/users", permissions: [USER_READ], note: "持有 user:read" },
  {
    pathname: "/admin/properties/upload",
    permissions: [PROPERTY_UPLOAD],
    note: "持有 property:upload",
  },
  {
    pathname: "/admin/properties/governance",
    permissions: [PROPERTY_GOVERNANCE],
    note: "持有 property:governance",
  },
  {
    pathname: "/admin/audit-logs",
    permissions: [OPERATION_LOG_READ],
    note: "持有 operation_log:read",
  },
  {
    pathname: "/admin/settings/api-key",
    permissions: [API_KEY_MANAGE],
    note: "持有 api_key:manage",
  },
  { pathname: "/admin/leads", permissions: [LEAD_READ], note: "持有 lead:read" },
  { pathname: "/admin/leads/new", permissions: [LEAD_WRITE], note: "持有 lead:write" },
  { pathname: "/admin/projects", permissions: [PROJECT_READ], note: "持有 project:read" },
  {
    pathname: "/admin/projects/123",
    permissions: [USER_READ],
    note: "详情页刻意放行（exact 仅拦列表页）",
  },
  {
    pathname: "/admin/projects/123/renovation",
    permissions: [PROJECT_READ],
    note: "详情子页放行",
  },
  { pathname: "/admin/ledger", permissions: [LEDGER_READ], note: "持有 ledger:read" },
  {
    pathname: "/admin/marketing",
    permissions: [L4_MARKETING_READ],
    note: "持有 l4_marketing:read",
  },
  { pathname: "/admin/investments", permissions: [INVESTMENT_READ], note: "持有 investment:read" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * 配置本用例的 pathname 与 usePermission 返回值。
 *
 * 注意：真实 `usePermission` 已把 `data?.permissions ?? []` 归一化为数组，
 * 因此此处同样以数组形态注入；「字段缺失」在用例表中表达为 `[]`。
 */
function setGuardState(
  pathname: string,
  permissions: string[],
  overrides: { isLoading?: boolean; error?: unknown } = {},
) {
  mockUsePathnameState.pathname = pathname;
  mockUsePermission.mockReturnValue({
    permissions,
    roleCode: null,
    hasPermission: (code: string) => permissions.includes(code),
    hasAnyPermission: (codes: string[]) => codes.some((c) => permissions.includes(c)),
    isLoading: false,
    error: null,
    ...overrides,
  });
}

function renderGuard() {
  return render(
    <PermissionGuard>
      <span>content</span>
    </PermissionGuard>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("PermissionGuard — 受限路径拦截", () => {
  beforeEach(() => {
    mockUsePermission.mockReset();
    mockRouter.replace.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(DENIED)("$pathname 无对应权限 → 重定向 /admin（$note）", ({ pathname, permissions }) => {
    setGuardState(pathname, permissions);

    renderGuard();

    expect(mockRouter.replace).toHaveBeenCalledWith("/admin");
  });

  it.each(ALLOWED)(
    "$pathname 权限满足或路径开放 → 不重定向（$note）",
    ({ pathname, permissions }) => {
      setGuardState(pathname, permissions);

      renderGuard();

      expect(mockRouter.replace).not.toHaveBeenCalled();
    },
  );

  it("权限满足时正常渲染 children", () => {
    setGuardState("/admin/users", [USER_READ]);

    renderGuard();

    expect(screen.getByText("content")).toBeInTheDocument();
  });

  // ─── 加载中 / 查询错误：不做权限判定，避免误弹回工作台 ──────────────────────
  // 权限查询未返回时无法确定真实权限；出错同理（如网络抖动）。
  // 两种情况都不弹回 —— 后端 API 仍会做 require_permission 校验，安全性不受影响。
  it("权限查询加载中（isLoading）→ 不重定向", () => {
    setGuardState("/admin/users", [], { isLoading: true });

    renderGuard();

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });

  it("权限查询出错（error）→ 不重定向", () => {
    setGuardState("/admin/users", [], { error: new Error("network down") });

    renderGuard();

    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
