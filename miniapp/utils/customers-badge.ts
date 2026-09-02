/**
 * 我的客户角标工具：封装 GET /public/customers/my/badge 的 new_count 计数查询.
 *
 * 口径取当前 C 端用户（referrer）统一状态为 new 的线索数，与「我的客户」列表页
 * 「新线索」chip 口径一致，用于 profile 分享获客分组入口角标。
 *
 * - 每次调用实时查询（不做内存缓存）：保证从「我的客户」页操作（状态流转/查看号码
 *   new→contacted）返回「我的」页时角标立即反映最新 new 线索数；
 * - 403（非归属/无 C 端令牌）与网络失败均静默返回 null，调用方隐藏角标不打扰。
 */
import type { components } from "../types/api-types";
import { request } from "./request";

type BadgeResponse = components["schemas"]["MyCustomerBadgeResponse"];

/**
 * 拉取我的客户新线索计数（new_count）.
 *
 * Returns:
 *   新线索数；无权限（403/401）或网络失败时返回 null（调用方隐藏角标）.
 */
export async function fetchCustomersBadgeCount(): Promise<number | null> {
  try {
    const badge = await request<BadgeResponse>({
      url: "/public/customers/my/badge",
    });
    return badge.new_count ?? 0;
  } catch {
    // 403 / 网络失败：静默降级
    return null;
  }
}