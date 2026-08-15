"use client";

import { useCallback, useMemo } from "react";
import useSWR from "swr";
import { fetcher } from "@/lib/swr";

/**
 * 后端 `/api/v1/auth/me` 响应的最小子集（仅权限相关字段）。
 *
 * 完整响应类型见 `@/lib/api-types` 的 `UserResponse`；其中 `permissions` 字段
 * 由 Task 8 后端新增。此处刻意使用本地子集类型而非直接引用 `UserResponse`，
 * 以避免在前端类型（`pnpm gen-api`）尚未同步时产生编译错误，并让本 hook
 * 只依赖其真正消费的字段。
 */
interface AuthMePermissionResponse {
  permissions?: string[] | null;
  /** 主角色 code；用于无 permission 字段的菜单项回退到 roles 判断 */
  role?: { code?: string | null } | null;
}

/** SWR key：固定为后端当前用户信息端点 */
const AUTH_ME_KEY = "/api/v1/auth/me";

export interface UsePermissionReturn {
  /** 当前用户持有的权限码列表；未登录或加载中时为空数组 */
  permissions: string[];
  /** 当前用户主角色 code；未登录或加载中时为 null */
  roleCode: string | null;
  /** 判断是否持有指定权限码 */
  hasPermission: (code: string) => boolean;
  /** 判断是否持有给定权限码列表中的任一权限 */
  hasAnyPermission: (codes: string[]) => boolean;
  /** 是否正在加载（首次请求未完成） */
  isLoading: boolean;
}

/**
 * 查询当前用户权限的 Hook。
 *
 * 实现说明：
 * - 使用项目统一的 `fetcher`（`@/lib/swr`），自动复用 401 token 刷新逻辑。
 * - 通过全局 `SWRProvider`（`src/app/layout.tsx`）共享缓存，多个组件同时调用
 *   本 hook 只会发起一次网络请求（SWR dedupingInterval 默认 2s）。
 * - `permissions` 用 `useMemo` 缓存，依赖 SWR 返回的 `data`（SWR 在数据未变时
 *   保持引用稳定），从而保证下游 `useCallback` 的引用也稳定。
 *
 * @returns 权限集合与判断函数
 */
export function usePermission(): UsePermissionReturn {
  const { data, isLoading } = useSWR<AuthMePermissionResponse>(AUTH_ME_KEY, fetcher);

  const permissions = useMemo<string[]>(() => data?.permissions ?? [], [data]);

  const roleCode = useMemo<string | null>(() => data?.role?.code ?? null, [data]);

  const hasPermission = useCallback(
    (code: string): boolean => permissions.includes(code),
    [permissions],
  );

  const hasAnyPermission = useCallback(
    (codes: string[]): boolean => codes.some((c) => permissions.includes(c)),
    [permissions],
  );

  return {
    permissions,
    roleCode,
    hasPermission,
    hasAnyPermission,
    isLoading,
  };
}
