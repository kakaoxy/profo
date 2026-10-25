import { cache } from "react";
import { fetchClient } from "@/lib/api-server";
import { isRedirectError } from "@/lib/auth/server/session";
import { logger } from "@/lib/logger";
import type { components } from "@/lib/api-types";

type WorkbenchConfigResponse = components["schemas"]["WorkbenchConfigResponse"];

export interface WorkbenchLayoutResult {
  /** 三级 fallback 后的生效布局；null 表示取数失败（页面回落旧版仪表盘） */
  layout: WorkbenchConfigResponse | null;
  error?: string;
}

/**
 * 读取当前用户生效的工作台布局（服务端，React.cache 保证同请求只取一次）。
 *
 * 后端已按「用户覆盖 → 角色默认 → 代码兜底」三级 fallback 并做完权限过滤，
 * 前端只需按返回的 key 渲染。
 */
export const getWorkbenchLayout = cache(async (): Promise<WorkbenchLayoutResult> => {
  const client = await fetchClient();
  try {
    const { data, error } = await client.GET("/api/v1/admin/workbench/config", {});
    if (error) {
      return { layout: null, error: "工作台布局加载失败" };
    }
    return { layout: data ?? null };
  } catch (e) {
    // 401 场景 fetchClient 抛 NEXT_REDIRECT，必须放行否则刷新重定向链断裂
    if (isRedirectError(e)) throw e;
    logger.error("[Workbench] 布局获取失败:", e);
    return { layout: null, error: "工作台布局加载失败" };
  }
});
