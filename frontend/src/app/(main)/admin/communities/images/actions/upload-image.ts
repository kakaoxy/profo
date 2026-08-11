"use server";

/**
 * 小区户型图库 Server Actions.
 *
 * 提供 list / upload / update / delete 四个操作，权限校验在 Server Action 层
 * （requirePermission），后端 Router 依赖 PropertyReadPermDep / PropertyWritePermDep
 * 做二次校验。
 *
 * upload 为 multipart 上传，openapi-fetch 的类型对 binary 字段生成 `{ file: string }`，
 * 实际运行时传 FormData —— 用 `as never` 绕过类型，openapi-fetch 会自动设置
 * multipart/form-data boundary。
 */

import type { components } from "@/lib/api-types";
import { fetchClient } from "@/lib/api-server";
import { logger } from "@/lib/logger";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/server/require-permission";
import { parseApiError, parseNetworkError } from "@/lib/error-utils";

type CommunityImageResponse = components["schemas"]["CommunityImageResponse"];
type CommunityImageListResponse = components["schemas"]["CommunityImageListResponse"];

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; message: string };

/**
 * 按小区查询户型图列表.
 */
export async function listCommunityImagesAction(
  communityId: string,
  page: number = 1,
  pageSize: number = 20,
): Promise<ActionResult<CommunityImageListResponse>> {
  const perm = await requirePermission(PERMISSION_CODES.PROPERTY_READ);
  if (!perm.ok) return { success: false, message: perm.message };

  const client = await fetchClient();
  const { data, error } = await client.GET(
    "/api/v1/admin/communities/{community_id}/images",
    {
      params: {
        path: { community_id: communityId },
        query: { page, page_size: pageSize },
      },
    },
  );
  if (error || !data) {
    return { success: false, message: parseApiError(error).message };
  }
  return { success: true, data };
}

/**
 * 上传户型图到指定小区（multipart）.
 *
 * Server Action 接收 Next.js 序列化的 File 对象，构造 FormData 转发到后端。
 * 使用 fetchClient 的底层 fetch（含 401 自动刷新），但手动构造请求以支持 FormData。
 */
export async function uploadCommunityImageAction(
  communityId: string,
  file: File,
  description?: string,
): Promise<ActionResult<CommunityImageResponse>> {
  const perm = await requirePermission(PERMISSION_CODES.PROPERTY_WRITE);
  if (!perm.ok) return { success: false, message: perm.message };

  try {
    const client = await fetchClient();
    const formData = new FormData();
    formData.append("file", file);

    // openapi-fetch 对 multipart 的 body 类型生成 { file: string }，
    // 运行时传 FormData 即可，用 as never 绕过类型检查
    const { data, error } = await client.POST(
      "/api/v1/admin/communities/{community_id}/images",
      {
        params: {
          path: { community_id: communityId },
          query: { description: description ?? undefined },
        },
        body: formData as never,
      },
    );
    if (error || !data) {
      return { success: false, message: parseApiError(error).message };
    }
    return { success: true, data };
  } catch (e) {
    logger.error("uploadCommunityImageAction error:", e);
    return { success: false, message: parseNetworkError(e) };
  }
}

/**
 * 更新户型图描述（PATCH 语义）.
 */
export async function updateCommunityImageAction(
  imageId: number,
  body: { description?: string | null },
): Promise<ActionResult<CommunityImageResponse>> {
  const perm = await requirePermission(PERMISSION_CODES.PROPERTY_WRITE);
  if (!perm.ok) return { success: false, message: perm.message };

  const client = await fetchClient();
  const { data, error } = await client.PATCH(
    "/api/v1/admin/community-images/{image_id}",
    {
      params: { path: { image_id: imageId } },
      body,
    },
  );
  if (error || !data) {
    return { success: false, message: parseApiError(error).message };
  }
  return { success: true, data };
}

/**
 * 软删除户型图.
 */
export async function deleteCommunityImageAction(
  imageId: number,
): Promise<ActionResult<null>> {
  const perm = await requirePermission(PERMISSION_CODES.PROPERTY_WRITE);
  if (!perm.ok) return { success: false, message: perm.message };

  const client = await fetchClient();
  const { error, response } = await client.DELETE(
    "/api/v1/admin/community-images/{image_id}",
    {
      params: { path: { image_id: imageId } },
    },
  );
  if (error || !response?.ok) {
    return { success: false, message: parseApiError(error).message };
  }
  return { success: true, data: null };
}

/**
 * 按小区查询户型图（用于线索创建表单的户型图选择器）.
 *
 * 复用 listCommunityImagesAction 的权限与逻辑，但接收 communityId 参数
 * 供 lead 表单调用。
 */
export async function listCommunityImagesForLeadAction(
  communityId: string,
): Promise<ActionResult<CommunityImageListResponse>> {
  return listCommunityImagesAction(communityId, 1, 100);
}
