/**
 * 待评估角标工具：封装 GET /public/leads/pending-assessment 的 pending_total 计数查询.
 *
 * 口径取「评估工作台」自身的全局待评估队列总数（pending_total），与工作台页面
 * 「待评估」段统计一致；不使用 /my/acquired/stats 的 pending_assessment（该值为
 * 个人获客线索待评估数，系不同维度，会导致角标与工作台内实际待办不符）。
 *
 * - 每次调用实时查询（不做内存缓存）：从评估工作台/授权页处理待办后返回，
 *   profile / 估价提交页入口角标立即反映最新待办；
 * - 403（无 admin/operator 角色）与网络失败均静默返回 null，调用方隐藏角标不打扰。
 */
import type { components } from "../types/api-types";
import { request } from "./request";

type QueueResponse = components["schemas"]["PendingAssessmentQueueResponse"];

/**
 * 拉取待评估计数（评估工作台全局待评估总数）.
 *
 * page_size=1 只为最小化响应体：pending_total 为全量计数，不受分页影响。
 *
 * Returns:
 *   待评估总数；无权限（403）或网络失败时返回 null（调用方隐藏角标）.
 */
export async function fetchPendingAssessmentCount(): Promise<number | null> {
  try {
    const queue = await request<QueueResponse>({
      url: "/public/leads/pending-assessment",
      data: { page: 1, page_size: 1 },
    });
    return queue.pending_total ?? 0;
  } catch {
    // 403 / 网络失败：静默降级
    return null;
  }
}