"use client";

import { usePermission } from "@/hooks/use-permission";

interface HasPermissionProps {
  /** 权限码（单个字符串或数组，数组为 OR 语义） */
  code: string | string[];
  /** 权限不通过时渲染的兜底内容，默认 null */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * 根据当前用户权限条件渲染 children。
 *
 * - `code` 为字符串时：要求用户持有该权限。
 * - `code` 为数组时：OR 语义，任一权限满足即通过；空数组视为不通过。
 * - 未通过时渲染 `fallback`（默认 `null`，即不渲染任何内容）。
 *
 * 依赖 `usePermission` Hook（Task 12），由其负责权限数据获取与缓存。
 */
export function HasPermission({
  code,
  fallback = null,
  children,
}: HasPermissionProps) {
  const { hasPermission, hasAnyPermission } = usePermission();

  const passed = Array.isArray(code)
    ? hasAnyPermission(code)
    : hasPermission(code);

  return passed ? <>{children}</> : <>{fallback}</>;
}
