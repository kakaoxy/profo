"use server";

import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import type {
  L4MarketingProjectUpdate,
  L4MarketingProjectCreate,
  L4MarketingMediaCreate,
  L4MarketingMediaUpdate,
} from "./types";

// ============================================================================
// L4 Marketing Projects Actions
// ============================================================================

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
      return {
        success: false,
        error: (error as { detail?: string }).detail || "获取项目列表失败",
      };
    }

    return { success: true, data };
  } catch (e) {
    console.error("获取项目列表异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
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
      return {
        success: false,
        error: (error as { detail?: string }).detail || "创建项目失败",
      };
    }

    revalidatePath("/minipro/projects");
    return { success: true, data };
  } catch (e) {
    console.error("创建项目异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
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
      return {
        success: false,
        error: (error as { detail?: string }).detail || "获取项目详情失败",
      };
    }

    return { success: true, data };
  } catch (e) {
    console.error("获取项目详情异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
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
      return {
        success: false,
        error: (error as { detail?: string }).detail || "更新项目失败",
      };
    }

    revalidatePath(`/minipro/projects/${id}`);
    revalidatePath("/minipro/projects");
    return { success: true, data };
  } catch (e) {
    console.error("更新项目异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
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
      return {
        success: false,
        error: (error as { detail?: string }).detail || "删除项目失败",
      };
    }

    revalidatePath("/minipro/projects");
    return { success: true };
  } catch (e) {
    console.error("删除项目异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

// ============================================================================
// L4 Marketing Media Actions
// ============================================================================

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
      return {
        success: false,
        error: (error as { detail?: string }).detail || "获取媒体列表失败",
      };
    }

    return { success: true, data };
  } catch (e) {
    console.error("获取媒体列表异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
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
      return {
        success: false,
        error: (error as { detail?: string }).detail || "创建媒体失败",
      };
    }

    revalidatePath(`/minipro/projects/${projectId}`);
    return { success: true, data };
  } catch (e) {
    console.error("创建媒体异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
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
      return {
        success: false,
        error: (error as { detail?: string }).detail || "更新媒体失败",
      };
    }

    return { success: true, data };
  } catch (e) {
    console.error("更新媒体异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
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
      return {
        success: false,
        error: (error as { detail?: string }).detail || "删除媒体失败",
      };
    }

    return { success: true };
  } catch (e) {
    console.error("删除媒体异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
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
