/**
 * 我的客户角标工具：封装 GET /public/customers/my/badge 的 new_count 计数查询.
 *
 * 口径取当前 C 端用户（referrer）统一状态为 new 的线索数，与「我的客户」列表页
 * 「新线索」chip 口径一致，用于 profile 分享获客分组入口角标。
 *
 * - 60s 内存缓存：profile 页多个入口共享，避免同会话重复请求；
 * - 403（非归属/无 C 端令牌）与网络失败均静默返回 null，调用方隐藏角标不打扰。
 */
import type { components } from "../types/api-types";
import { request } from "./request";

type BadgeResponse = components["schemas"]["MyCustomerBadgeResponse"];

/** 缓存有效期（ms）. */
const CACHE_TTL_MS = 60_000;

/** 内存缓存：仅 0/正数缓存，失败不缓存（下次进入可重试）. */
let cached: { value: number; at: number } | null = null;

/**
 * 拉取我的客户新线索计数（new_count）.
 *
 * Returns:
 *   新线索数；无权限（403/401）或网络失败时返回 null（调用方隐藏角标）.
 */
export async function fetchCustomersBadgeCount(): Promise<number | null> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }
  try {
    const badge = await request<BadgeResponse>({
      url: "/public/customers/my/badge",
    });
    const value = badge.new_count ?? 0;
    cached = { value, at: Date.now() };
    return value;
  } catch {
    // 403 / 网络失败：静默降级，不缓存（下次进入可重试）
    return null;
  }
}
