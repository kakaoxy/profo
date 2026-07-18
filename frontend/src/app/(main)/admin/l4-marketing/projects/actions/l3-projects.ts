"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { parseApiError, parseNetworkError } from "@/lib/error-utils";
import { z } from "zod";
import type { ProjectQueryParams } from "@/app/(main)/admin/l4-marketing/projects/_components/project-selector/types";
import type { ActionResult } from "@/app/(main)/admin/l4-marketing/projects/actions/projects";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/server/require-permission";

// L3 项目 ID schema（字符串 UUID，使用 min(1) 而非 uuid）
const l3ProjectIdSchema = z.string().min(1, "L3 项目 ID 不能为空");

/**
 * 获取可关联的L3项目列表
 */
export async function getAvailableL3ProjectsAction(
  params: ProjectQueryParams
): Promise<ActionResult<{ items: unknown[]; total: number }>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/admin/l4-marketing/available-projects",
      {
        params: {
          query: {
            page: params.page,
            page_size: params.page_size,
            community_name: params.community_name,
            status: params.status,
          },
        },
      },
    );

    if (error) {
      logger.error("Failed to fetch available L3 projects:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    return { success: true, data: data as { items: unknown[]; total: number } };
  } catch (e) {
    logger.error("获取可关联项目列表异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/**
 * 从L3项目导入数据
 */
export async function importFromL3ProjectAction(projectId: string): Promise<ActionResult<unknown>> {
  const idParsed = l3ProjectIdSchema.safeParse(projectId);
  if (!idParsed.success) {
    return { success: false, error: idParsed.error.issues[0]?.message ?? "参数不合法" };
  }
  const permCheck = await requirePermission(PERMISSION_CODES.L4_MARKETING_WRITE);
  if (!permCheck.ok) {
    return { success: false, error: permCheck.message };
  }
  try {
    const client = await fetchClient();
    const { data, error } = await client.POST(
      "/api/v1/admin/l4-marketing/projects/import-from-l3/{project_id}",
      {
        params: { path: { project_id: projectId } },
      },
    );

    if (error) {
      logger.error("Failed to import from L3 project:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    return { success: true, data };
  } catch (e) {
    logger.error("从L3项目导入数据异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/**
 * 获取L3项目详情
 */
export async function getL3ProjectDetailAction(projectId: string): Promise<ActionResult<unknown>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/admin/l4-marketing/available-projects/{project_id}",
      {
        params: { path: { project_id: projectId } },
      },
    );

    if (error) {
      logger.error("Failed to fetch L3 project detail:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    return { success: true, data };
  } catch (e) {
    logger.error("获取L3项目详情异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}
