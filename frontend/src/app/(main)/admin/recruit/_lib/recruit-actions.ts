"use server";

/**
 * 招募管理 Server Actions。
 *
 * 写操作（创建/编辑活动、切换状态、线索流转、图片上传）经 Server Action 层
 * 权限校验（requirePermission）后转发后端，成功后 revalidatePath 刷新页面数据。
 */

import { revalidatePath } from "next/cache";

import { fetchClient } from "@/lib/api-server";
import { logger } from "@/lib/logger";
import { components } from "@/lib/api-types";
import { ActionResult, extractErrorMessage } from "@/lib/action-result";
import { parseApiError, parseNetworkError } from "@/lib/error-utils";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/server/require-permission";
import type { RecruitCampaignStatus, RecruitLeadStatus } from "../types";

type RecruitCampaignResponse = components["schemas"]["RecruitCampaignResponse"];
type RecruitCampaignCreate = components["schemas"]["RecruitCampaignCreate"];
type RecruitCampaignUpdate = components["schemas"]["RecruitCampaignUpdate"];
type RecruitLeadListItem = components["schemas"]["RecruitLeadListItem"];
type FileUploadResponse = components["schemas"]["FileUploadResponse"];

/** 活动表单提交数据（前端表单 → Server Action 入参） */
export interface CampaignFormData {
  name: string;
  title: string;
  image_url: string | null;
  status: RecruitCampaignStatus;
}

const CAMPAIGNS_PATH = "/admin/recruit/campaigns";
const LEADS_PATH = "/admin/recruit/leads";

// ─── 活动增删改 ────────────────────────────────────────────────────────────────

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
      status: data.status,
    };
    const { data: responseData, error } = await client.POST("/api/v1/admin/recruit/campaigns", {
      body: payload,
    });
    if (error || !responseData) {
      return { success: false, error: extractErrorMessage(error) };
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
      status: data.status,
    };
    const { data: responseData, error } = await client.PUT(
      "/api/v1/admin/recruit/campaigns/{campaign_id}",
      { params: { path: { campaign_id: campaignId } }, body: payload },
    );
    if (error || !responseData) {
      return { success: false, error: extractErrorMessage(error) };
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
  nextStatus: RecruitCampaignStatus,
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
      return { success: false, error: extractErrorMessage(error) };
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
      return { success: false, error: extractErrorMessage(error) };
    }
    revalidatePath(CAMPAIGNS_PATH);
    return { success: true, data: undefined };
  } catch (e) {
    logger.error("deleteCampaignAction error:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

// ─── 线索状态流转 ──────────────────────────────────────────────────────────────

/** 线索跟进状态流转。 */
export async function updateLeadStatusAction(
  leadId: string,
  nextStatus: RecruitLeadStatus,
): Promise<ActionResult<RecruitLeadListItem>> {
  const perm = await requirePermission(PERMISSION_CODES.RECRUIT_WRITE);
  if (!perm.ok) return { success: false, error: perm.message };

  try {
    const client = await fetchClient();
    const { data: responseData, error } = await client.PUT(
      "/api/v1/admin/recruit/leads/{lead_id}/status",
      {
        params: { path: { lead_id: leadId } },
        body: { status: nextStatus },
      },
    );
    if (error || !responseData) {
      return { success: false, error: parseApiError(error).message };
    }
    revalidatePath(LEADS_PATH);
    return { success: true, data: responseData };
  } catch (e) {
    logger.error("updateLeadStatusAction error:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

// ─── 图片上传 ──────────────────────────────────────────────────────────────────

/** 上传分享配图，返回 CDN URL。 */
export async function uploadCampaignImageAction(
  file: File,
): Promise<ActionResult<FileUploadResponse>> {
  const perm = await requirePermission(PERMISSION_CODES.RECRUIT_WRITE);
  if (!perm.ok) return { success: false, error: perm.message };

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

// ─── 小程序码 ──────────────────────────────────────────────────────────────────

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
      return { success: false, error: extractErrorMessage(error) };
    }
    return { success: true, data: responseData };
  } catch (e) {
    logger.error("generateCampaignQRCodeAction error:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

// ─── 线索完整手机号 ────────────────────────────────────────────────────────────

/** 获取线索完整手机号（持写权限）。 */
export async function getLeadPhoneAction(leadId: string): Promise<ActionResult<string>> {
  const perm = await requirePermission(PERMISSION_CODES.RECRUIT_WRITE);
  if (!perm.ok) return { success: false, error: perm.message };

  try {
    const client = await fetchClient();
    const { data: responseData, error } = await client.GET(
      "/api/v1/admin/recruit/leads/{lead_id}/phone",
      { params: { path: { lead_id: leadId } } },
    );
    if (error || !responseData) {
      return { success: false, error: extractErrorMessage(error) };
    }
    return { success: true, data: responseData.phone };
  } catch (e) {
    logger.error("getLeadPhoneAction error:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}
