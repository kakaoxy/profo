"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { revalidateTag } from "next/cache";
import { parseApiError, parseNetworkError } from "@/lib/error-utils";
import { z } from "zod";
import type {
  L4MarketingMediaCreate,
  L4MarketingMediaUpdate,
} from "@/app/(main)/admin/l4-marketing/projects/types";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/server/require-permission";

// ============================================================================
// Zod schemas
// ============================================================================

const mediaIdSchema = z.number().int().min(1, "媒体 ID 不合法");
const projectIdSchema = z.number().int().min(1, "项目 ID 不合法");

// 与 L4MarketingMediaCreate 对齐
// file_url 允许空字符串：批量导入场景依赖 origin_media_id，file_url 由后端回填
const l4MediaCreateSchema = z
  .object({
    media_type: z.enum(["image", "video"]),
    photo_category: z.enum(["marketing", "renovation"]),
    renovation_stage: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    sort_order: z.number().int().min(0, "排序不能小于0"),
    origin_media_id: z.string().nullable().optional(),
    file_url: z.string(),
    thumbnail_url: z.string().nullable().optional(),
  })
  .refine(
    (data) => data.file_url.trim().length > 0 || (data.origin_media_id?.trim().length ?? 0) > 0,
    { message: "file_url 与 origin_media_id 至少需提供一个" },
  );

// 与 L4MarketingMediaUpdate 对齐（所有字段可选）
const l4MediaUpdateSchema = z.object({
  photo_category: z.enum(["marketing", "renovation"]).nullable().optional(),
  renovation_stage: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  sort_order: z.number().int().min(0, "排序不能小于0").nullable().optional(),
  thumbnail_url: z.string().nullable().optional(),
});

// 批量添加照片
const batchAddPhotosSchema = z.object({
  projectId: projectIdSchema,
  photoIds: z.array(z.string().min(1, "照片 ID 不能为空")).min(1, "至少选择一张照片"),
});

// 批量更新排序（与 MediaSortOrderUpdate 对齐）
const mediaSortItemSchema = z.object({
  media_id: z.number().int().min(1, "媒体 ID 不合法"),
  sort_order: z.number().int().min(0, "排序不能小于0"),
});
const batchUpdateSortSchema = z.object({
  projectId: projectIdSchema,
  sortUpdates: z.array(mediaSortItemSchema).min(1, "至少一条排序更新"),
});

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
      logger.error("Failed to fetch L4 marketing media:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    return { success: true, data };
  } catch (e) {
    logger.error("获取媒体列表异常:", e);
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
  const idParsed = projectIdSchema.safeParse(projectId);
  if (!idParsed.success) {
    return { success: false, error: idParsed.error.issues[0]?.message ?? "参数不合法" };
  }
  const parsed = l4MediaCreateSchema.safeParse(body);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "参数不合法" };
  }
  const permCheck = await requirePermission(PERMISSION_CODES.L4_MARKETING_WRITE);
  if (!permCheck.ok) {
    return { success: false, error: permCheck.message };
  }
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
      logger.error("Failed to create L4 marketing media:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    revalidateTag(`l4-marketing-project-${projectId}`, { expire: 0 });
    revalidateTag("l4-marketing-projects", { expire: 0 });
    return { success: true, data };
  } catch (e) {
    logger.error("创建媒体异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/**
 * 更新媒体
 * @param mediaId - 媒体ID
 * @param projectId - 项目ID，用于缓存重新验证
 * @param body - 更新数据
 */
export async function updateL4MarketingMediaAction(
  mediaId: number,
  projectId: number,
  body: L4MarketingMediaUpdate,
) {
  const mediaIdParsed = mediaIdSchema.safeParse(mediaId);
  if (!mediaIdParsed.success) {
    return { success: false, error: mediaIdParsed.error.issues[0]?.message ?? "参数不合法" };
  }
  const projectIdParsed = projectIdSchema.safeParse(projectId);
  if (!projectIdParsed.success) {
    return { success: false, error: projectIdParsed.error.issues[0]?.message ?? "参数不合法" };
  }
  const parsed = l4MediaUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "参数不合法" };
  }
  const permCheck = await requirePermission(PERMISSION_CODES.L4_MARKETING_WRITE);
  if (!permCheck.ok) {
    return { success: false, error: permCheck.message };
  }
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
      logger.error("Failed to update L4 marketing media:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    revalidateTag(`l4-marketing-project-${projectId}`, { expire: 0 });
    revalidateTag("l4-marketing-projects", { expire: 0 });
    return { success: true, data };
  } catch (e) {
    logger.error("更新媒体异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/**
 * 删除媒体
 * @param mediaId - 媒体ID
 * @param projectId - 项目ID，用于缓存重新验证
 */
export async function deleteL4MarketingMediaAction(mediaId: number, projectId: number) {
  const mediaIdParsed = mediaIdSchema.safeParse(mediaId);
  if (!mediaIdParsed.success) {
    return { success: false, error: mediaIdParsed.error.issues[0]?.message ?? "参数不合法" };
  }
  const projectIdParsed = projectIdSchema.safeParse(projectId);
  if (!projectIdParsed.success) {
    return { success: false, error: projectIdParsed.error.issues[0]?.message ?? "参数不合法" };
  }
  const permCheck = await requirePermission(PERMISSION_CODES.L4_MARKETING_WRITE);
  if (!permCheck.ok) {
    return { success: false, error: permCheck.message };
  }
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE(
      "/api/v1/admin/l4-marketing/media/{media_id}",
      {
        params: { path: { media_id: mediaId } },
      },
    );

    if (error) {
      logger.error("Failed to delete L4 marketing media:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    revalidateTag(`l4-marketing-project-${projectId}`, { expire: 0 });
    revalidateTag("l4-marketing-projects", { expire: 0 });
    return { success: true };
  } catch (e) {
    logger.error("删除媒体异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/**
 * 批量添加照片
 */
export async function batchAddL4PhotosAction(
  projectId: number,
  photoIds: string[],
) {
  const parsed = batchAddPhotosSchema.safeParse({ projectId, photoIds });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "参数不合法" };
  }
  const permCheck = await requirePermission(PERMISSION_CODES.L4_MARKETING_WRITE);
  if (!permCheck.ok) {
    return { success: false, error: permCheck.message };
  }
  const results = [];
  const errors: string[] = [];

  const responses = await Promise.all(
    photoIds.map((photoId, i) =>
      createL4MarketingMediaAction(projectId, {
        file_url: "",
        media_type: "image",
        photo_category: "marketing",
        origin_media_id: photoId,
        renovation_stage: null,
        sort_order: i,
      })
    )
  );

  for (const [i, result] of responses.entries()) {
    if (result.success && result.data) {
      results.push(result.data);
    } else {
      errors.push(`ID: ${photoIds[i]}`);
    }
  }

  revalidateTag(`l4-marketing-project-${projectId}`, { expire: 0 });
  revalidateTag("l4-marketing-projects", { expire: 0 });

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
  const parsed = batchUpdateSortSchema.safeParse({ projectId, sortUpdates });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "参数不合法" };
  }
  const permCheck = await requirePermission(PERMISSION_CODES.L4_MARKETING_WRITE);
  if (!permCheck.ok) {
    return { success: false, error: permCheck.message };
  }
  try {
    const client = await fetchClient();
    // 使用类型断言绕过 OpenAPI 类型检查
    const { data, error } = await (client as unknown as {
      PUT: (path: string, options: { params: { path: { project_id: number } }; body: unknown }) => Promise<{ data: unknown; error: unknown }>;
    }).PUT(
      "/api/v1/admin/l4-marketing/projects/{project_id}/media/sort-order",
      {
        params: { path: { project_id: projectId } },
        body: sortUpdates,
      },
    );

    if (error) {
      logger.error("Failed to update media sort order:", error);
      const { message } = parseApiError(error);
      return { success: false, error: message };
    }

    revalidateTag(`l4-marketing-project-${projectId}`, { expire: 0 });
    revalidateTag("l4-marketing-projects", { expire: 0 });
    return { success: true, data };
  } catch (e) {
    logger.error("更新媒体排序异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}
