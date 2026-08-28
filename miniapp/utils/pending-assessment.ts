/**
 * 待评估角标工具：封装 GET /public/leads/my/acquired/stats 的 pending_assessment 计数查询.
 *
 * - 60s 内存缓存：profile / 估价提交页多个入口共享，避免同会话重复请求；
 * - 403（无 admin/operator 角色）与网络失败均静默返回 null，调用方隐藏角标不打扰；
 * - 授权操作成功后调用 invalidatePendingAssessmentCount 让角标尽快反映最新待办.
 */
import type { components } from "../types/api-types";
import { request } from "./request";

type AcquiredStats = components["schemas"]["PublicAcquiredLeadStatsResponse"];

/** 缓存有效期（ms）. */
const CACHE_TTL_MS = 60_000;

/** 内存缓存：value 为 null 表示「最近一次失败」不缓存，仅 0/正数缓存. */
let cached: { value: number; at: number } | null = null;

/**
 * 拉取待评估计数（pending_assessment）.
 *
 * Returns:
 *   未处理数量；无权限（403）或网络失败时返回 null（调用方隐藏角标）.
 */
export async function fetchPendingAssessmentCount(): Promise<number | null> {
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.value;
  }
  try {
    const stats = await request<AcquiredStats>({ url: "/public/leads/my/acquired/stats" });
    const value = stats.pending_assessment ?? 0;
    cached = { value, at: Date.now() };
    return value;
  } catch {
    // 403 / 网络失败：静默降级，不缓存（下次进入可重试）
    return null;
  }
}

/** 失效角标缓存（授权操作后调用，下一次查询重新拉取）. */
export function invalidatePendingAssessmentCount(): void {
  cached = null;
}
