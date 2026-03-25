"use server";

import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import type {
  L4MarketingProjectUpdate,
  L4MarketingProjectCreate,
  L4ConsultantCreate,
  L4ConsultantUpdate,
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
  isPublished?: boolean,
  projectStatus?: string,
  consultantId?: string,
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
            is_published: isPublished,
            project_status: projectStatus,
            consultant_id: consultantId,
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
export async function getL4MarketingProjectAction(id: string) {
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
  id: string,
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
export async function deleteL4MarketingProjectAction(id: string) {
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

/**
 * 同步 L3 项目到 L4
 */
export async function syncL4MarketingProjectsAction() {
  try {
    const client = await fetchClient();
    const { data, error } = await client.POST(
      "/api/v1/admin/l4-marketing/projects/sync",
    );

    if (error) {
      console.error("Failed to sync L4 marketing projects:", error);
      return {
        success: false,
        error: (error as { detail?: string }).detail || "同步失败",
      };
    }

    revalidatePath("/minipro/projects");
    return { success: true, data };
  } catch (e) {
    console.error("同步项目异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

/**
 * 刷新项目硬字段
 */
export async function refreshL4MarketingProjectAction(id: string) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.PUT(
      "/api/v1/admin/l4-marketing/projects/{project_id}/refresh",
      {
        params: { path: { project_id: id } },
      },
    );

    if (error) {
      console.error("Failed to refresh L4 marketing project:", error);
      return {
        success: false,
        error: (error as { detail?: string }).detail || "刷新项目失败",
      };
    }

    revalidatePath(`/minipro/projects/${id}`);
    return { success: true, data };
  } catch (e) {
    console.error("刷新项目异常:", e);
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
  projectId: string,
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
  projectId: string,
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
  mediaId: string,
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
export async function deleteL4MarketingMediaAction(mediaId: string) {
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
 * 获取来源照片（从 L3 项目）
 */
export async function getL4SourcePhotosAction(projectId: string) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/admin/l4-marketing/projects/{project_id}/source-photos",
      {
        params: { path: { project_id: projectId } },
      },
    );

    if (error) {
      console.error("Failed to fetch L4 source photos:", error);
      return {
        success: false,
        error: (error as { detail?: string }).detail || "获取来源照片失败",
      };
    }

    return { success: true, data };
  } catch (e) {
    console.error("获取来源照片异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

/**
 * 批量添加照片
 */
export async function batchAddL4PhotosAction(
  projectId: string,
  photoIds: string[],
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

// ============================================================================
// L4 Consultants Actions
// ============================================================================

/**
 * 获取顾问列表
 */
export async function getL4ConsultantsAction(
  page = 1,
  size = 20,
  isActive?: boolean,
) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/admin/l4-marketing/consultants",
      {
        params: {
          query: {
            page,
            size,
            is_active: isActive,
          },
        },
      },
    );

    if (error) {
      console.error("Failed to fetch L4 consultants:", error);
      return {
        success: false,
        error: (error as { detail?: string }).detail || "获取顾问列表失败",
      };
    }

    return { success: true, data };
  } catch (e) {
    console.error("获取顾问列表异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

/**
 * 获取顾问详情
 */
export async function getL4ConsultantAction(id: string) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/admin/l4-marketing/consultants/{consultant_id}",
      {
        params: { path: { consultant_id: id } },
      },
    );

    if (error) {
      console.error("Failed to fetch L4 consultant:", error);
      return {
        success: false,
        error: (error as { detail?: string }).detail || "获取顾问详情失败",
      };
    }

    return { success: true, data };
  } catch (e) {
    console.error("获取顾问详情异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

/**
 * 创建顾问
 */
export async function createL4ConsultantAction(body: L4ConsultantCreate) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.POST(
      "/api/v1/admin/l4-marketing/consultants",
      {
        body,
      },
    );

    if (error) {
      console.error("Failed to create L4 consultant:", error);
      return {
        success: false,
        error: (error as { detail?: string }).detail || "创建顾问失败",
      };
    }

    revalidatePath("/minipro/consultants");
    return { success: true, data };
  } catch (e) {
    console.error("创建顾问异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

/**
 * 更新顾问
 */
export async function updateL4ConsultantAction(
  id: string,
  body: L4ConsultantUpdate,
) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.PUT(
      "/api/v1/admin/l4-marketing/consultants/{consultant_id}",
      {
        params: { path: { consultant_id: id } },
        body,
      },
    );

    if (error) {
      console.error("Failed to update L4 consultant:", error);
      return {
        success: false,
        error: (error as { detail?: string }).detail || "更新顾问失败",
      };
    }

    revalidatePath("/minipro/consultants");
    return { success: true, data };
  } catch (e) {
    console.error("更新顾问异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}

/**
 * 删除顾问
 */
export async function deleteL4ConsultantAction(id: string) {
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE(
      "/api/v1/admin/l4-marketing/consultants/{consultant_id}",
      {
        params: { path: { consultant_id: id } },
      },
    );

    if (error) {
      console.error("Failed to delete L4 consultant:", error);
      return {
        success: false,
        error: (error as { detail?: string }).detail || "删除顾问失败",
      };
    }

    revalidatePath("/minipro/consultants");
    return { success: true };
  } catch (e) {
    console.error("删除顾问异常:", e);
    return { success: false, error: "网络错误，请稍后重试" };
  }
}
