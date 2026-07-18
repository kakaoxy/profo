"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";
import { extractApiData } from "@/lib/api-helpers";
import { z } from "zod";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import {
  requireAnyPermission,
  requirePermission,
} from "@/lib/auth/server/require-permission";

const projectIdSchema = z.string().min(1, "项目 ID 不能为空");
const photoIdSchema = z.string().min(1, "照片 ID 不能为空");

// addRenovationPhotoAction 入参（JSON，文件已通过 useUpload 单独上传）
const addRenovationPhotoSchema = z.object({
  projectId: projectIdSchema,
  stage: z.string().min(1, "装修阶段不能为空"),
  url: z.string().min(1, "照片 URL 不能为空"),
  thumbnail_url: z.string().optional(),
  filename: z.string().optional(),
});

// updateRenovationStageAction 入参
const updateRenovationStageSchema = z.object({
  projectId: projectIdSchema,
  renovation_stage: z.string().min(1, "装修阶段不能为空"),
  stage_completed_at: z.string().optional(),
});

// updateRenovationContractAction 入参
// 参考 renovation/contract-form/schema.ts::renovationContractSchema
// 日期字段在表单 handleSave 中已 format 为 "yyyy-MM-dd" 字符串，故使用 z.string()
const updateRenovationContractSchema = z.object({
  renovation_company: z.string().max(200).optional(),
  contact_person_id: z.string().max(36).optional(),
  contract_start_date: z.string().optional(),
  contract_end_date: z.string().optional(),
  actual_start_date: z.string().optional(),
  actual_end_date: z.string().optional(),
  hard_contract_amount: z.number().optional(),
  payment_node_1: z.string().max(100).optional(),
  payment_ratio_1: z.number().min(0).max(100).optional(),
  payment_node_2: z.string().max(100).optional(),
  payment_ratio_2: z.number().min(0).max(100).optional(),
  payment_node_3: z.string().max(100).optional(),
  payment_ratio_3: z.number().min(0).max(100).optional(),
  payment_node_4: z.string().max(100).optional(),
  payment_ratio_4: z.number().min(0).max(100).optional(),
  soft_budget: z.number().optional(),
  soft_detail_attachment: z.string().max(500).optional(),
  custom_cabinet_amount: z.number().optional(),
  window_amount: z.number().optional(),
  wall_treatment_amount: z.number().optional(),
  design_fee: z.number().optional(),
  demolition_fee: z.number().optional(),
  garbage_fee: z.number().optional(),
  other_extra_fee: z.number().optional(),
  other_fee_reason: z.string().optional(),
});

/**
 * 删除装修照片
 */
export async function deleteRenovationPhotoAction(
  projectId: string,
  photoId: string,
) {
  const idParsed = projectIdSchema.safeParse(projectId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "参数不合法",
    };
  }

  const photoParsed = photoIdSchema.safeParse(photoId);
  if (!photoParsed.success) {
    return {
      success: false,
      message: photoParsed.error.issues[0]?.message ?? "参数不合法",
    };
  }

  const permCheck = await requireAnyPermission([
    PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO,
    PERMISSION_CODES.PROJECT_WRITE,
    PERMISSION_CODES.PROJECT_RENOVATION_COMPLETE_STAGE,
  ]);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }

  try {
    const client = await fetchClient();
    const { error } = await client.DELETE(
      "/api/v1/projects/{project_id}/renovation/photos/{photo_id}",
      {
        params: {
          path: {
            project_id: projectId,
            photo_id: photoId,
          },
        },
      },
    );

    if (error) {
      const errorMsg = (error as { message?: string })?.message || "删除照片失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/admin/projects");
    return { success: true, message: "照片已删除" };
  } catch (e) {
    logger.error("删除照片异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * 获取装修照片列表
 */
export async function getRenovationPhotosAction(projectId: string) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/projects/{project_id}/renovation/photos",
      {
        params: {
          path: { project_id: projectId },
        },
      },
    );

    if (error) {
      const errorMsg = (error as { message?: string }).message || "获取照片失败";
      return { success: false, message: errorMsg };
    }

    const extracted = extractApiData<{ items: unknown[]; total: number }>(data);
    const photos = extracted?.items ?? [];
    return { success: true, data: photos };
  } catch (e) {
    logger.error("获取装修照片异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * 添加装修照片
 */
export async function addRenovationPhotoAction(payload: {
  projectId: string;
  stage: string;
  url: string;
  thumbnail_url?: string;
  filename?: string;
}) {
  const parsed = addRenovationPhotoSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "参数不合法",
    };
  }

  const permCheck = await requireAnyPermission([
    PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO,
    PERMISSION_CODES.PROJECT_WRITE,
    PERMISSION_CODES.PROJECT_RENOVATION_COMPLETE_STAGE,
  ]);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }

  try {
    const client = await fetchClient();
    const { error } = await client.POST(
      "/api/v1/projects/{project_id}/renovation/photos",
      {
        params: {
          path: { project_id: payload.projectId },
          query: {
            stage: payload.stage,
            url: payload.url,
            thumbnail_url: payload.thumbnail_url,
            filename: payload.filename,
          },
        },
      },
    );

    if (error) {
      const errorMsg =
        (error as { message?: string }).message || "上传照片记录失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/admin/projects");
    return { success: true, message: "上传成功" };
  } catch (e) {
    logger.error("上传照片异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * 更新装修阶段 / 完成阶段
 */
export async function updateRenovationStageAction(payload: {
  projectId: string;
  renovation_stage: string;
  stage_completed_at?: string;
}) {
  const parsed = updateRenovationStageSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "参数不合法",
    };
  }

  const permCheck = await requireAnyPermission([
    PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO,
    PERMISSION_CODES.PROJECT_WRITE,
    PERMISSION_CODES.PROJECT_RENOVATION_COMPLETE_STAGE,
  ]);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }

  try {
    const client = await fetchClient();
    const { error } = await client.PUT(
      "/api/v1/projects/{project_id}/renovation",
      {
        params: { path: { project_id: payload.projectId } },
        body: {
          // @ts-expect-error - API 类型定义与后端实际接口不完全同步
          renovation_stage: payload.renovation_stage,
          stage_completed_at: payload.stage_completed_at,
        },
      },
    );

    if (error) {
      const errorMsg = (error as { message?: string }).message || "更新阶段失败";
      return { success: false, message: errorMsg };
    }

    revalidatePath("/admin/projects");
    return { success: true, message: "阶段更新成功" };
  } catch (e) {
    logger.error("更新阶段异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * 获取装修合同信息
 */
export async function getRenovationContractAction(projectId: string) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/projects/{project_id}/renovation/contract",
      {
        params: { path: { project_id: projectId } },
      },
    );

    if (error) {
      const errorMsg = (error as { message?: string }).message || "获取装修合同信息失败";
      return { success: false, message: errorMsg };
    }

    const contract = extractApiData<Record<string, unknown>>(data);
    return { success: true, data: contract };
  } catch (e) {
    logger.error("获取装修合同信息异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * 更新装修合同信息
 */
export async function updateRenovationContractAction(
  projectId: string,
  payload: Record<string, unknown>
) {
  const idParsed = projectIdSchema.safeParse(projectId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "参数不合法",
    };
  }

  const parsed = updateRenovationContractSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "参数不合法",
    };
  }

  const permCheck = await requirePermission(PERMISSION_CODES.PROJECT_WRITE);
  if (!permCheck.ok) {
    return { success: false, message: permCheck.message };
  }

  try {
    const client = await fetchClient();
    const { data, error } = await client.PUT(
      "/api/v1/projects/{project_id}/renovation/contract",
      {
        params: { path: { project_id: projectId } },
        body: payload as Record<string, never>,
      },
    );

    if (error) {
      const errorMsg = (error as { message?: string }).message || "更新装修合同信息失败";
      return { success: false, message: errorMsg };
    }

    const contract = extractApiData<Record<string, unknown>>(data);
    revalidatePath("/admin/projects");
    return { success: true, data: contract, message: "装修合同信息已更新" };
  } catch (e) {
    logger.error("更新装修合同信息异常:", e);
    return { success: false, message: "网络错误" };
  }
}
