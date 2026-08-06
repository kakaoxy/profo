"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { revalidateTag } from "next/cache";
import { parseApiError, parseNetworkError } from "@/lib/error-utils";
import { z } from "zod";
import type {
  L4MarketingProjectUpdate,
  L4MarketingProjectCreate,
  L4MarketingProject,
} from "@/app/(main)/admin/marketing/types";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/server/require-permission";

// ============================================================================
// Zod schemas - 与 _components/form-schema.ts 的 createSchema/updateSchema 对齐
// ============================================================================

const projectIdSchema = z.number().int().min(1, "项目 ID 不合法");

// 与 form-schema.ts::createSchema 对齐（必填字段从严，可选项宽松）
const l4ProjectCreateSchema = z.object({
  community_id: z.string().min(1, "请选择小区"),
  community_name: z.string().trim().max(200).nullable().optional(),
  layout: z.string().trim().min(1, "户型不能为空").max(100, "户型最多100个字符"),
  orientation: z.string().trim().min(1, "朝向不能为空").max(50, "朝向最多50个字符"),
  floor_info: z.string().trim().min(1, "楼层信息不能为空").max(100, "楼层信息最多100个字符"),
  area: z.number().positive("面积必须大于0"),
  total_price: z.number().positive("总价必须大于0"),
  title: z.string().trim().min(1, "标题不能为空").max(255, "标题最多255个字符"),
  images: z.array(z.string()).optional(),
  sort_order: z.number().int().min(0, "排序权重不能小于0").optional(),
  tags: z.array(z.string()).optional(),
  decoration_style: z.string().trim().max(100, "装修风格最多100个字符").nullable().optional(),
  stage_completed_dates: z.record(z.string(), z.string()).nullable().optional(),
  publish_status: z.enum(["草稿", "发布"]),
  project_status: z.enum(["在途", "在售", "已售"]),
  project_id: z.string().uuid().nullable().optional(),
  consultant_id: z.string().trim().min(1).max(36).nullable().optional(),
});

// 与 form-schema.ts::updateSchema 对齐（所有字段可选）
const l4ProjectUpdateSchema = z.object({
  community_id: z.string().min(1, "请选择小区").nullable().optional(),
  community_name: z.string().trim().max(200, "小区名称最多200个字符").nullable().optional(),
  layout: z.string().trim().min(1, "户型不能为空").max(100, "户型最多100个字符").nullable().optional(),
  orientation: z.string().trim().min(1, "朝向不能为空").max(50, "朝向最多50个字符").nullable().optional(),
  floor_info: z.string().trim().min(1, "楼层信息不能为空").max(100, "楼层信息最多100个字符").nullable().optional(),
  area: z.number().positive("面积必须大于0").nullable().optional(),
  total_price: z.number().positive("总价必须大于0").nullable().optional(),
  title: z.string().trim().min(1, "标题不能为空").max(255, "标题最多255个字符").nullable().optional(),
  images: z.array(z.string()).nullable().optional(),
  sort_order: z.number().int().min(0, "排序权重不能小于0").nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  decoration_style: z.string().trim().max(100, "装修风格最多100个字符").nullable().optional(),
  stage_completed_dates: z.record(z.string(), z.string()).nullable().optional(),
  publish_status: z.enum(["草稿", "发布"]).nullable().optional(),
  project_status: z.enum(["在途", "在售", "已售"]).nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  consultant_id: z.string().trim().min(1).max(36).nullable().optional(),
});

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
  consultantId?: string,
  communityId?: string,
): Promise<ActionResult<{ items: unknown[]; total: number; page: number; page_size: number }>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/admin/marketing/projects",
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
      logger.error("Failed to fetch L4 marketing projects:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    return { success: true, data: data! };
  } catch (e) {
    logger.error("获取项目列表异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/**
 * 创建营销项目
 */
export async function createL4MarketingProjectAction(
  body: L4MarketingProjectCreate,
): Promise<ActionResult<L4MarketingProject>> {
  const parsed = l4ProjectCreateSchema.safeParse(body);
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
      "/api/v1/admin/marketing/projects",
      {
        body,
      },
    );

    if (error) {
      logger.error("Failed to create L4 marketing project:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    revalidateTag("marketing-projects", { expire: 0 });
    return { success: true, data: data! };
  } catch (e) {
    logger.error("创建项目异常:", e);
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
      "/api/v1/admin/marketing/projects/{project_id}",
      {
        params: { path: { project_id: id } },
      },
    );

    if (error) {
      logger.error("Failed to fetch L4 marketing project:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    return { success: true, data: data! };
  } catch (e) {
    logger.error("获取项目详情异常:", e);
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
  const idParsed = projectIdSchema.safeParse(id);
  if (!idParsed.success) {
    return { success: false, error: idParsed.error.issues[0]?.message ?? "参数不合法" };
  }
  const parsed = l4ProjectUpdateSchema.safeParse(body);
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
      "/api/v1/admin/marketing/projects/{project_id}",
      {
        params: { path: { project_id: id } },
        body,
      },
    );

    if (error) {
      logger.error("Failed to update L4 marketing project:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    revalidateTag(`marketing-project-${id}`, { expire: 0 });
    revalidateTag("marketing-projects", { expire: 0 });
    return { success: true, data: data! };
  } catch (e) {
    logger.error("更新项目异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/**
 * 删除营销项目
 */
export async function deleteL4MarketingProjectAction(id: number): Promise<ActionResult<void>> {
  const idParsed = projectIdSchema.safeParse(id);
  if (!idParsed.success) {
    return { success: false, error: idParsed.error.issues[0]?.message ?? "参数不合法" };
  }
  const permCheck = await requirePermission(PERMISSION_CODES.L4_MARKETING_WRITE);
  if (!permCheck.ok) {
    return { success: false, error: permCheck.message };
  }
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE(
      "/api/v1/admin/marketing/projects/{project_id}",
      {
        params: { path: { project_id: id } },
      },
    );

    if (error) {
      logger.error("Failed to delete L4 marketing project:", error);
      const { message } = parseApiError(error);
      return {
        success: false,
        error: message,
      };
    }

    revalidateTag("marketing-projects", { expire: 0 });
    return { success: true, data: undefined };
  } catch (e) {
    logger.error("删除项目异常:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}
