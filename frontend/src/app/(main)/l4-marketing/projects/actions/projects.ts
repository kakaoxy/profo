"use server";

import { fetchClient } from "@/lib/api-server";
import { revalidateTag } from "next/cache";
import { parseApiError, parseNetworkError } from "@/lib/error-utils";
import type {
  L4MarketingProjectUpdate,
  L4MarketingProjectCreate,
  L4MarketingProject,
} from "@/app/(main)/l4-marketing/projects/types";

// ============================================================================
// 统一返回类型定义
// ============================================================================

/** 成功的 Action 返回 */
export type ActionSuccess<T> = {
  success: true;
  data: T;
};

/** 失败的 Action 返回 */
export type ActionError = {
  success: false;
  error: string;
};

/** 统一的 Action 返回类型 */
export type ActionResult<T = void> = ActionSuccess<T> | ActionError;

// ============================================================================
// Action 实现
// ============================================================================

/**
 * 获取营销项目列表
 */
export async function getL4MarketingProjectsAction(
  page = 1,
  pageSize = 20,
  publishStatus?: string,
  projectStatus?: string,
  consultantId?: number,
  communityId?: number,
): Promise<ActionResult<{ items: unknown[]; total: number; page: number; page_size: number }>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/admin/l4-marketing/projects",
      {
        params: {
          query: {
            page,
            page_size: pageSize,
            publish_status: publishStatus,
            project_status: projectStatus,
            consultant_id: consultantId,
            community_id: communityId,
          },
        },
      },
    );

    if (error) {
      console.error("Failed to fetch L4 marketing projects:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    return { success: true, data: data! };
  } catch (e) {
    console.error("获取项目列表异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/**
 * 创建营销项目
 */
export async function createL4MarketingProjectAction(
  body: L4MarketingProjectCreate,
): Promise<ActionResult<L4MarketingProject>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.POST(
      "/api/v1/admin/l4-marketing/projects",
      {
        body,
      },
    );

    if (error) {
      console.error("Failed to create L4 marketing project:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    revalidateTag("l4-marketing-projects", { expire: 0 });
    return { success: true, data: data! };
  } catch (e) {
    console.error("创建项目异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/**
 * 获取营销项目详情
 */
export async function getL4MarketingProjectAction(id: number): Promise<ActionResult<L4MarketingProject>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/admin/l4-marketing/projects/{project_id}",
      {
        params: { path: { project_id: id } },
      },
    );

    if (error) {
      console.error("Failed to fetch L4 marketing project:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    return { success: true, data: data! };
  } catch (e) {
    console.error("获取项目详情异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/**
 * 更新营销项目
 */
export async function updateL4MarketingProjectAction(
  id: number,
  body: L4MarketingProjectUpdate,
): Promise<ActionResult<L4MarketingProject>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.PUT(
      "/api/v1/admin/l4-marketing/projects/{project_id}",
      {
        params: { path: { project_id: id } },
        body,
      },
    );

    if (error) {
      console.error("Failed to update L4 marketing project:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    revalidateTag(`l4-marketing-project-${id}`, { expire: 0 });
    revalidateTag("l4-marketing-projects", { expire: 0 });
    return { success: true, data: data! };
  } catch (e) {
    console.error("更新项目异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/**
 * 删除营销项目
 */
export async function deleteL4MarketingProjectAction(id: number): Promise<ActionResult<void>> {
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE(
      "/api/v1/admin/l4-marketing/projects/{project_id}",
      {
        params: { path: { project_id: id } },
      },
    );

    if (error) {
      console.error("Failed to delete L4 marketing project:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    revalidateTag("l4-marketing-projects", { expire: 0 });
    return { success: true, data: undefined };
  } catch (e) {
    console.error("删除项目异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}
