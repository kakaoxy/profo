"use server";

import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import type {
  L4MarketingProjectUpdate,
  L4MarketingProjectCreate,
} from "../types";

/**
 * 解析 API 错误响应
 */
function parseApiError(error: unknown): { message: string; type: string } {
  if (typeof error === "object" && error !== null) {
    const err = error as Record<string, unknown>;

    // FastAPI 标准错误格式
    if (typeof err.detail === "string") {
      return { message: err.detail, type: "api" };
    }

    // 验证错误 (Pydantic validation errors)
    if (Array.isArray(err.detail)) {
      const validationErrors = err.detail
        .map((e: { loc?: string[]; msg?: string }) => `${e.loc?.join(".")}: ${e.msg}`)
        .join("; ");
      return { message: `数据验证失败: ${validationErrors}`, type: "validation" };
    }

    // 其他错误消息
    if (typeof err.message === "string") {
      return { message: err.message, type: "api" };
    }
  }

  return { message: "操作失败，请稍后重试", type: "unknown" };
}

/**
 * 解析网络错误
 */
function parseNetworkError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("fetch") || error.message.includes("network")) {
      return "网络连接失败，请检查网络后重试";
    }
    if (error.message.includes("timeout")) {
      return "请求超时，请稍后重试";
    }
    return error.message;
  }
  return "网络错误，请稍后重试";
}

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
