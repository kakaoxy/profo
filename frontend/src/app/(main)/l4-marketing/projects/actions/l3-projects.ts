"use server";

import { fetchClient } from "@/lib/api-server";
import { parseApiError, parseNetworkError } from "@/lib/error-utils";
import type { ProjectQueryParams } from "../_components/project-selector/types";
import type { ActionResult } from "./projects";

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
      console.error("Failed to fetch available L3 projects:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    return { success: true, data: data as { items: unknown[]; total: number } };
  } catch (e) {
    console.error("获取可关联项目列表异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/**
 * 从L3项目导入数据
 */
export async function importFromL3ProjectAction(projectId: string): Promise<ActionResult<unknown>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.POST(
      "/api/v1/admin/l4-marketing/projects/import-from-l3/{project_id}",
      {
        params: { path: { project_id: projectId } },
      },
    );

    if (error) {
      console.error("Failed to import from L3 project:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    return { success: true, data };
  } catch (e) {
    console.error("从L3项目导入数据异常:", e);
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
      console.error("Failed to fetch L3 project detail:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    return { success: true, data };
  } catch (e) {
    console.error("获取L3项目详情异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}
