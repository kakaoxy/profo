"use server";

import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { parseApiError, parseNetworkError } from "@/lib/error-utils";
import type {
  L4MarketingProjectUpdate,
  L4MarketingProjectCreate,
} from "../types";
import type { ProjectQueryParams } from "../_components/project-selector/types";

/**
 * 获取营销项目列表
 */
export async function getL4MarketingProjectsAction(
  page = 1,
  size = 20,
  publishStatus?: string,
  projectStatus?: string,
  consultantId?: number,
  communityId?: number,
) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/admin/l4-marketing/projects",
      {
        params: {
          query: {
            page,
            size,
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

    return { success: true, data };
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
) {
  try {
    // console.log("[Action] Creating project with body:", JSON.stringify(body, null, 2));
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

    // console.log("[Action] Created project:", data);
    revalidatePath("/l4-marketing/projects");
    return { success: true, data };
  } catch (e) {
    console.error("创建项目异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/**
 * 获取营销项目详情
 */
export async function getL4MarketingProjectAction(id: number) {
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

    return { success: true, data };
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
) {
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

    revalidatePath(`/l4-marketing/projects/${id}`);
    revalidatePath("/l4-marketing/projects");
    return { success: true, data };
  } catch (e) {
    console.error("更新项目异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/**
 * 删除营销项目
 */
export async function deleteL4MarketingProjectAction(id: number) {
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

    revalidatePath("/l4-marketing/projects");
    return { success: true };
  } catch (e) {
    console.error("删除项目异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/**
 * 获取可关联的L3项目列表
 */
export async function getAvailableL3ProjectsAction(
  params: ProjectQueryParams
) {
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

    return { success: true, data };
  } catch (e) {
    console.error("获取可关联项目列表异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/**
 * 从L3项目导入数据
 */
export async function importFromL3ProjectAction(projectId: string) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.POST(
      "/api/v1/admin/l4-marketing/projects/import-from-l3/{project_id}" as any,
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
export async function getL3ProjectDetailAction(projectId: string) {
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
