/**
 * 服务端权限校验工具。
 *
 * 仅供 Server Actions / Server Components 调用，依赖 httpOnly cookie 中的 access_token。
 * 校验失败时返回 `{ ok: false, message }`，调用方应据此直接返回失败响应，不发起后端写请求。
 *
 * 缓存策略：
 * - `fetchClient` 已被 `React.cache()` 包裹，同一请求内复用同一 client 实例
 * - `getCurrentUserPermissions` 同样用 `React.cache()` 包裹，避免同一 Server Action 内
 *   多次调用 `requirePermission` 时重复发起 `/api/v1/auth/me` 请求
 */
import { cache } from "react";

import { fetchClient } from "@/lib/api-server";
import { logger } from "@/lib/logger";

/** 权限校验成功结果 */
type PermissionOk = { ok: true };

/** 权限校验失败结果，`message` 用于回传给前端展示 */
type PermissionFail = { ok: false; message: string };

/**
 * 获取当前登录用户的权限码集合。
 *
 * 使用 `React.cache()` 包裹：同一请求（同一 Server Action 调用链）内多次调用只发起一次
 * `/api/v1/auth/me` HTTP 请求。请求失败时返回空权限集合与原始 HTTP 状态码。
 *
 * @returns
 *   - 成功：`{ permissions: string[], status: 200 }`
 *   - 失败：`{ permissions: [], status: number | undefined }`
 */
const getCurrentUserPermissions = cache(
  async (): Promise<{
    permissions: string[];
    status: number | undefined;
  }> => {
    const client = await fetchClient();
    const { data, error, response } = await client.GET("/api/v1/auth/me");

    if (error || !data) {
      return { permissions: [], status: response?.status };
    }

    return { permissions: data.permissions ?? [], status: 200 };
  },
);

/**
 * 单权限校验：当前用户必须持有指定权限码才放行。
 *
 * @param code - 权限码，应来自 `PERMISSION_CODES` 常量，避免 magic string
 * @returns
 *   - `{ ok: true }` 权限通过
 *   - `{ ok: false, message }` 权限不足、未登录或获取权限异常
 */
export async function requirePermission(code: string): Promise<PermissionOk | PermissionFail> {
  try {
    const { permissions, status } = await getCurrentUserPermissions();

    if (status === 401) {
      return { ok: false, message: "登录已过期，请重新登录" };
    }
    if (status !== 200) {
      return { ok: false, message: "权限校验失败" };
    }
    if (!permissions.includes(code)) {
      return { ok: false, message: `权限不足：需要 ${code} 权限` };
    }
    return { ok: true };
  } catch (e) {
    logger.error("requirePermission 异常", e);
    return { ok: false, message: "权限校验异常" };
  }
}

/**
 * 多权限 OR 校验：当前用户持有 `codes` 中任意一个即放行。
 *
 * @param codes - 权限码数组（至少 1 个），应来自 `PERMISSION_CODES` 常量
 * @returns
 *   - `{ ok: true }` 持有任一权限即通过
 *   - `{ ok: false, message }` 全部权限均未持有、未登录或获取权限异常
 */
export async function requireAnyPermission(
  codes: string[],
): Promise<PermissionOk | PermissionFail> {
  if (codes.length === 0) {
    return { ok: false, message: "权限不足" };
  }
  try {
    const { permissions, status } = await getCurrentUserPermissions();

    if (status === 401) {
      return { ok: false, message: "登录已过期，请重新登录" };
    }
    if (status !== 200) {
      return { ok: false, message: "权限校验失败" };
    }
    if (!codes.some((c) => permissions.includes(c))) {
      return { ok: false, message: "权限不足" };
    }
    return { ok: true };
  } catch (e) {
    logger.error("requireAnyPermission 异常", e);
    return { ok: false, message: "权限校验异常" };
  }
}
