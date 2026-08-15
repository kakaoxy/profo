"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { components } from "@/lib/api-types";

export type OperationLogResponse = components["schemas"]["OperationLogResponse"];
export type OperationLogListResponse = components["schemas"]["OperationLogListResponse"];

/**
 * 获取操作审计日志列表（只读查询，无权限前置校验，路由层已用 PATH_PERMISSION_MAP 拦截）。
 *
 * @param params - 分页与筛选条件（user_id/action/resource_type/时间范围）
 * @returns 成功返回 data，失败返回 message
 */
export async function getOperationLogsAction(params: {
  page?: number;
  page_size?: number;
  user_id?: string;
  action?: string;
  resource_type?: string;
  start_time?: string;
  end_time?: string;
}): Promise<
  { success: true; data: OperationLogListResponse } | { success: false; message: string }
> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/operation-logs", {
      params: { query: params },
    });

    if (error) {
      logger.error("Get operation logs error", error);
      return { success: false, message: "获取审计日志失败" };
    }

    return { success: true, data };
  } catch (error) {
    logger.error("Get operation logs exception:", error);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
