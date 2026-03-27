"use server";

import { fetchClient } from "@/lib/api-server";
import type {
  L4MarketingMediaCreate,
  L4MarketingMediaUpdate,
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
 * 获取媒体列表
 */
export async function getL4MarketingMediaAction(
  projectId: number,
  page = 1,
  size = 100,
) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/admin/l4-marketing/projects/{project_id}/media",
      {
        params: {
          path: { project_id: projectId },
          query: { page, size },
        },
      },
    );

    if (error) {
      console.error("Failed to fetch L4 marketing media:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    return { success: true, data };
  } catch (e) {
    console.error("获取媒体列表异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/**
 * 创建媒体
 */
export async function createL4MarketingMediaAction(
  projectId: number,
  body: L4MarketingMediaCreate,
) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.POST(
      "/api/v1/admin/l4-marketing/projects/{project_id}/media",
      {
        params: { path: { project_id: projectId } },
        body,
      },
    );

    if (error) {
      console.error("Failed to create L4 marketing media:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    return { success: true, data };
  } catch (e) {
    console.error("创建媒体异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/**
 * 更新媒体
 */
export async function updateL4MarketingMediaAction(
  mediaId: number,
  body: L4MarketingMediaUpdate,
) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.PUT(
      "/api/v1/admin/l4-marketing/media/{media_id}",
      {
        params: { path: { media_id: mediaId } },
        body,
      },
    );

    if (error) {
      console.error("Failed to update L4 marketing media:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    return { success: true, data };
  } catch (e) {
    console.error("更新媒体异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/**
 * 删除媒体
 */
export async function deleteL4MarketingMediaAction(mediaId: number) {
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE(
      "/api/v1/admin/l4-marketing/media/{media_id}",
      {
        params: { path: { media_id: mediaId } },
      },
    );

    if (error) {
      console.error("Failed to delete L4 marketing media:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    return { success: true };
  } catch (e) {
    console.error("删除媒体异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/**
 * 批量添加照片
 */
export async function batchAddL4PhotosAction(
  projectId: number,
  photoIds: number[],
) {
  const results = [];
  const errors: string[] = [];

  let sortOrder = 0;
  for (const photoId of photoIds) {
    const result = await createL4MarketingMediaAction(projectId, {
      file_url: "",
      media_type: "image",
      origin_media_id: photoId,
      renovation_stage: "other",
      sort_order: sortOrder,
    });

    if (result.success && result.data) {
      results.push(result.data);
      sortOrder += 1;
    } else {
      errors.push(`ID: ${photoId}`);
    }
  }

  if (errors.length > 0) {
    return {
      success: results.length > 0,
      data: results,
      error: `部分照片添加失败: ${errors.join(", ")}`,
    };
  }

  return { success: true, data: results };
}
