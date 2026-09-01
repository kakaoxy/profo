"use server";

/**
 * 获客中心 · 活动配置 Server Actions。
 *
 * 自 recruit-actions 迁移（一期活动管理沿用招募业务线后端契约）：
 * 写操作经 requirePermission(RECRUIT_WRITE) 校验后转发后端，
 * 成功后 revalidatePath 刷新 /admin/growth-center/campaigns 页面数据。
 */

import { revalidatePath } from "next/cache";

import { fetchClient } from "@/lib/api-server";
import { logger } from "@/lib/logger";
import type { components } from "@/lib/api-types";
import { ActionResult } from "@/lib/action-result";
import { parseApiError, parseNetworkError } from "@/lib/error-utils";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/server/require-permission";
import type { GrowthCampaignStatus } from "./campaign-data";

/** 上传图片大小上限（对齐 properties/upload-zone 的 10MB 图片惯例） */
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024;

type RecruitCampaignResponse = components["schemas"]["RecruitCampaignResponse"];
type RecruitCampaignCreate = components["schemas"]["RecruitCampaignCreate"];
type RecruitCampaignUpdate = components["schemas"]["RecruitCampaignUpdate"];
type FileUploadResponse = components["schemas"]["FileUploadResponse"];

/** 活动表单提交数据（前端表单 → Server Action 入参） */
export interface CampaignFormData {
  name: string;
  title: string;
  image_url: string | null;
  poster_bg_url: string | null;
  status: GrowthCampaignStatus;
}

const CAMPAIGNS_PATH = "/admin/growth-center/campaigns";

/** 新建招募活动。 */
export async function createCampaignAction(
  data: CampaignFormData,
): Promise<ActionResult<RecruitCampaignResponse>> {
  const perm = await requirePermission(PERMISSION_CODES.RECRUIT_WRITE);
  if (!perm.ok) return { success: false, error: perm.message };

  try {
    const client = await fetchClient();
    const payload: RecruitCampaignCreate = {
      name: data.name,
      title: data.title,
      image_url: data.image_url,
      poster_bg_url: data.poster_bg_url,
      status: data.status,
    };
    const { data: responseData, error } = await client.POST("/api/v1/admin/recruit/campaigns", {
      body: payload,
    });
    if (error || !responseData) {
      return { success: false, error: parseApiError(error).message };
    }
    revalidatePath(CAMPAIGNS_PATH);
    return { success: true, data: responseData };
  } catch (e) {
    logger.error("createCampaignAction error:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/** 编辑招募活动（全量 PUT）。 */
export async function updateCampaignAction(
  campaignId: string,
  data: CampaignFormData,
): Promise<ActionResult<RecruitCampaignResponse>> {
  const perm = await requirePermission(PERMISSION_CODES.RECRUIT_WRITE);
  if (!perm.ok) return { success: false, error: perm.message };

  try {
    const client = await fetchClient();
    const payload: RecruitCampaignUpdate = {
      name: data.name,
      title: data.title,
      image_url: data.image_url,
      poster_bg_url: data.poster_bg_url,
      status: data.status,
    };
    const { data: responseData, error } = await client.PUT(
      "/api/v1/admin/recruit/campaigns/{campaign_id}",
      { params: { path: { campaign_id: campaignId } }, body: payload },
    );
    if (error || !responseData) {
      return { success: false, error: parseApiError(error).message };
    }
    revalidatePath(CAMPAIGNS_PATH);
    return { success: true, data: responseData };
  } catch (e) {
    logger.error("updateCampaignAction error:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/** 切换活动启用/停用状态。 */
export async function toggleCampaignStatusAction(
  campaignId: string,
  nextStatus: GrowthCampaignStatus,
): Promise<ActionResult<RecruitCampaignResponse>> {
  const perm = await requirePermission(PERMISSION_CODES.RECRUIT_WRITE);
  if (!perm.ok) return { success: false, error: perm.message };

  try {
    const client = await fetchClient();
    const { data: responseData, error } = await client.PUT(
      "/api/v1/admin/recruit/campaigns/{campaign_id}",
      { params: { path: { campaign_id: campaignId } }, body: { status: nextStatus } },
    );
    if (error || !responseData) {
      return { success: false, error: parseApiError(error).message };
    }
    revalidatePath(CAMPAIGNS_PATH);
    return { success: true, data: responseData };
  } catch (e) {
    logger.error("toggleCampaignStatusAction error:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/** 删除招募活动（存在关联线索时后端拒绝，引导改用停用）. */
export async function deleteCampaignAction(campaignId: string): Promise<ActionResult<void>> {
  const perm = await requirePermission(PERMISSION_CODES.RECRUIT_WRITE);
  if (!perm.ok) return { success: false, error: perm.message };

  try {
    const client = await fetchClient();
    const { error } = await client.DELETE("/api/v1/admin/recruit/campaigns/{campaign_id}", {
      params: { path: { campaign_id: campaignId } },
    });
    if (error) {
      return { success: false, error: parseApiError(error).message };
    }
    revalidatePath(CAMPAIGNS_PATH);
    return { success: true, data: undefined };
  } catch (e) {
    logger.error("deleteCampaignAction error:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/** 上传分享配图，返回 CDN URL。 */
export async function uploadCampaignImageAction(
  file: File,
): Promise<ActionResult<FileUploadResponse>> {
  const perm = await requirePermission(PERMISSION_CODES.RECRUIT_WRITE);
  if (!perm.ok) return { success: false, error: perm.message };

  // 前置校验类型与大小，避免超大/非法文件直传后端
  if (!file.type.startsWith("image/")) {
    return { success: false, error: "仅支持图片文件（PNG/JPG 等）" };
  }
  if (file.size > MAX_UPLOAD_SIZE) {
    return { success: false, error: "图片大小不能超过 10MB" };
  }

  try {
    const client = await fetchClient();
    const formData = new FormData();
    formData.append("file", file);

    const { data: responseData, error } = await client.POST("/api/v1/files/upload", {
      body: formData as never,
    });
    if (error || !responseData) {
      return { success: false, error: parseApiError(error).message };
    }
    return { success: true, data: responseData };
  } catch (e) {
    logger.error("uploadCampaignImageAction error:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

/** 生成活动小程序码，返回 {code, image_base64}。 */
export async function generateCampaignQRCodeAction(
  campaignId: string,
  employeeId?: string,
): Promise<ActionResult<{ code: string; image_base64: string }>> {
  const perm = await requirePermission(PERMISSION_CODES.RECRUIT_WRITE);
  if (!perm.ok) return { success: false, error: perm.message };

  try {
    const client = await fetchClient();
    const { data: responseData, error } = await client.POST(
      "/api/v1/admin/recruit/campaigns/{campaign_id}/qrcode",
      {
        params: { path: { campaign_id: campaignId } },
        body: { employee_id: employeeId || undefined },
      },
    );
    if (error || !responseData) {
      return { success: false, error: parseApiError(error).message };
    }
    return { success: true, data: responseData };
  } catch (e) {
    logger.error("generateCampaignQRCodeAction error:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}
