/**
 * 前端权限常量与类型定义。
 *
 * 该文件为纯常量模块，无 'use client' 指令，可被 Server Component 与 Client Component 共同导入。
 * 后端权限码以字符串字面量形式镜像自后端权限字典，使用 `as const` 断言以保留字面量类型。
 */

// ─── 角色代码 ──────────────────────────────────────────────────────────────────

/**
 * 系统角色代码常量。
 * 与后端 Role.code 字段对齐：admin（管理员）/ operator（运营）/ user（内部用户）/ customer（C 端客户）。
 */
export const ROLE_CODES = {
  ADMIN: "admin",
  OPERATOR: "operator",
  USER: "user",
  CUSTOMER: "customer",
} as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];

// ─── 权限代码 ──────────────────────────────────────────────────────────────────

/**
 * 权限代码常量，按业务模块分组。
 * 字符串值与后端 Permission.code 严格对齐，格式为 `<module>:<action>`。
 */
export const PERMISSION_CODES = {
  // 用户管理
  USER_READ: "user:read",
  USER_CREATE: "user:create",
  USER_UPDATE: "user:update",
  USER_DELETE: "user:delete",
  USER_RESET_PASSWORD: "user:reset_password",
  // 角色管理
  ROLE_READ: "role:read",
  ROLE_CREATE: "role:create",
  ROLE_UPDATE: "role:update",
  ROLE_DELETE: "role:delete",
  ROLE_ASSIGN_PERMISSIONS: "role:assign_permissions",
  // 权限字典
  PERMISSION_READ: "permission:read",
  PERMISSION_MANAGE: "permission:manage",
  // 房源管理
  PROPERTY_READ: "property:read",
  PROPERTY_WRITE: "property:write",
  PROPERTY_UPLOAD: "property:upload",
  PROPERTY_GOVERNANCE: "property:governance",
  // 线索管理
  LEAD_READ: "lead:read",
  LEAD_WRITE: "lead:write",
  LEAD_EXPORT: "lead:export",
  LEAD_SUBMIT: "lead:submit",
  // 项目管理
  PROJECT_READ: "project:read",
  PROJECT_WRITE: "project:write",
  PROJECT_DELETE: "project:delete",
  // 项目业务身份子权限（对接负责人 / 销售团队成员）
  PROJECT_RENOVATION_UPLOAD_PHOTO: "project:renovation:upload_photo",
  PROJECT_RENOVATION_COMPLETE_STAGE: "project:renovation:complete_stage",
  PROJECT_SALES_ADD_RECORD: "project:sales:add_record",
  PROJECT_SALES_MANAGE_TEAM: "project:sales:manage_team",
  // 财务台账
  LEDGER_READ: "ledger:read",
  LEDGER_WRITE: "ledger:write",
  LEDGER_SETTLE: "ledger:settle",
  // 投资管理
  INVESTMENT_READ: "investment:read",
  INVESTMENT_WRITE: "investment:write",
  INVESTMENT_COPY: "investment:copy",
  // L4 市场营销
  L4_MARKETING_READ: "l4_marketing:read",
  L4_MARKETING_WRITE: "l4_marketing:write",
  // 审计日志
  OPERATION_LOG_READ: "operation_log:read",
  // API Key
  API_KEY_MANAGE: "api_key:manage",
  // C 端估价
  VALUATION_WRITE: "valuation:write",
} as const;

export type PermissionCode = (typeof PERMISSION_CODES)[keyof typeof PERMISSION_CODES];

// ─── 路径-权限映射 ─────────────────────────────────────────────────────────────

/**
 * 后台受限路径前缀 → 所需权限码的映射。
 *
 * 替代 `frontend/src/app/(main)/layout.tsx` 中按角色拦截的 `PATH_ROLE_RESTRICTIONS`，
 * 改为按权限码拦截，使权限模型更细粒度。
 *
 * ⚠️ 硬约束：必须按 prefix 长度降序排列，确保更长更具体的路径优先匹配。
 * 例如 `/admin/properties/upload` 必须排在 `/admin/properties` 之前。
 *
 * `exact: true` 表示仅精确匹配 prefix（不匹配子路径），用于"列表页需权限、
 * 详情页放行"的场景——详情页由后端 API 做权限校验（业务身份双通道）。
 * 例如 `/admin/projects` 列表页需 project:read，但 `/admin/projects/{id}`
 * 详情页放行，让被指派为业务负责人的普通用户能进入自己负责的项目详情。
 *
 * 未在此列表中的路径对所有后台角色（admin/operator/user）开放。
 */
export const PATH_PERMISSION_MAP: ReadonlyArray<{
  prefix: string;
  permission: string;
  exact?: boolean;
}> = [
  // 房源数据治理 → 需 property:governance 权限
  { prefix: "/admin/properties/governance", permission: PERMISSION_CODES.PROPERTY_GOVERNANCE },
  // 房源批量上传 → 需 property:upload 权限
  { prefix: "/admin/properties/upload", permission: PERMISSION_CODES.PROPERTY_UPLOAD },
  // L4 市场营销 → 需 l4_marketing:read 权限
  { prefix: "/admin/l4-marketing", permission: PERMISSION_CODES.L4_MARKETING_READ },
  // 跟投管理 → 需 investment:read 权限
  { prefix: "/admin/investments", permission: PERMISSION_CODES.INVESTMENT_READ },
  // 房源管理 → 需 property:read 权限
  { prefix: "/admin/properties", permission: PERMISSION_CODES.PROPERTY_READ },
  // 审计日志 → 需 operation_log:read 权限
  { prefix: "/admin/audit-logs", permission: PERMISSION_CODES.OPERATION_LOG_READ },
  // 设置（API Key 等）→ 需 api_key:manage 权限
  { prefix: "/admin/settings", permission: PERMISSION_CODES.API_KEY_MANAGE },
  // 项目管理列表页 → 需 project:read 权限；详情页 /admin/projects/{id} 放行，
  // 由后端 ProjectReadOrBusinessPermDep（业务身份双通道）校验——普通用户被指派
  // 为项目业务负责人后可进入自己负责的项目详情，不被角色权限覆盖
  { prefix: "/admin/projects", permission: PERMISSION_CODES.PROJECT_READ, exact: true },
  // 数据报表 → 需 property:read 权限
  { prefix: "/admin/reports", permission: PERMISSION_CODES.PROPERTY_READ },
  // 资金账本 → 需 ledger:read 权限
  { prefix: "/admin/ledger", permission: PERMISSION_CODES.LEDGER_READ },
  // 线索中心 → 需 lead:read 权限
  { prefix: "/admin/leads", permission: PERMISSION_CODES.LEAD_READ },
  // 用户管理 → 需 user:read 权限
  { prefix: "/admin/users", permission: PERMISSION_CODES.USER_READ },
];

// ─── 辅助函数 ──────────────────────────────────────────────────────────────────

/**
 * 判断权限集合是否具备指定路径的访问权限。
 * 非受限路径返回 true（对所有后台角色开放）。
 *
 * 匹配规则：按 PATH_PERMISSION_MAP 顺序，命中第一个 prefix 即返回对应权限校验结果。
 * 由于 PATH_PERMISSION_MAP 已按 prefix 长度降序排列，更长更具体的路径优先匹配。
 *
 * `exact: true` 的项仅精确匹配 prefix（`pathname === prefix`），不匹配子路径——
 * 用于"列表页需权限、详情页放行"的场景。
 *
 * @param pathname    - 当前请求路径（如 `/admin/users/123`）
 * @param permissions - 当前用户持有的权限码列表，null/undefined 视为无权限
 * @returns 是否允许访问
 */
export function hasPathPermission(
  pathname: string,
  permissions: ReadonlyArray<string> | null | undefined,
): boolean {
  for (const { prefix, permission, exact } of PATH_PERMISSION_MAP) {
    const matched = exact ? pathname === prefix : pathname.startsWith(prefix);
    if (matched) {
      return permissions?.includes(permission) ?? false;
    }
  }
  return true;
}

/**
 * 判断路径是否为后台受限路径（有权限要求）。
 *
 * @param pathname - 当前请求路径
 * @returns true 表示该路径在 PATH_PERMISSION_MAP 中有匹配项，需要权限校验
 */
export function isRestrictedAdminPath(pathname: string): boolean {
  return PATH_PERMISSION_MAP.some(({ prefix, exact }) =>
    exact ? pathname === prefix : pathname.startsWith(prefix),
  );
}
