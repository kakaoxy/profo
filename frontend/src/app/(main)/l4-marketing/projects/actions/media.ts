"use server";

import { fetchClient } from "@/lib/api-server";
import { parseApiError, parseNetworkError } from "@/lib/error-utils";
import type {
  L4MarketingMediaCreate,
  L4MarketingMediaUpdate,
} from "../types";

/**
 * 获取媒体列表
 */
export async function getL4MarketingMediaAction(
  projectId: number,
  page = 1,
  page_size = 100,
) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/admin/l4-marketing/projects/{project_id}/media",
      {
        params: {
          path: { project_id: projectId },
          query: { page, page_size },
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
      photo_category: "marketing" as any,
      origin_media_id: photoId,
      renovation_stage: "other",
      sort_order: sortOrder,
    } as any);

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

/**
 * 批量更新媒体排序
 */
export async function batchUpdateMediaSortOrderAction(
  projectId: number,
  sortUpdates: { media_id: number; sort_order: number }[]
) {
  try {
    const client = await fetchClient();
    // 使用类型断言绕过 OpenAPI 类型检查
    const { data, error } = await client.PUT(
      "/api/v1/admin/l4-marketing/projects/{project_id}/media/sort-order" as any,
      {
        params: { path: { project_id: projectId } },
        body: sortUpdates as any,
      },
    );

    if (error) {
      console.error("Failed to update media sort order:", error);
      const { message } = parseApiError(error);
      return { success: false, error: message };
    }

    return { success: true, data };
  } catch (e) {
    console.error("更新媒体排序异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}
