"use server";

/**
 * 获客中心 Server Actions。
 *
 * 写操作（招募线索状态流转）与敏感读操作（完整手机号、线索详情）经
 * Server Action 层权限校验（requirePermission）后转发后端，成功后
 * revalidatePath 刷新页面数据。
 */

import { revalidatePath } from "next/cache";

import { fetchClient } from "@/lib/api-server";
import { logger } from "@/lib/logger";
import { components } from "@/lib/api-types";
import { ActionResult, extractErrorMessage } from "@/lib/action-result";
import { parseApiError, parseNetworkError } from "@/lib/error-utils";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/server/require-permission";
import type { GrowthModule } from "../types";
import { getGrowthLeadDetail } from "./growth-data";

type RecruitLeadListItem = components["schemas"]["RecruitLeadListItem"];
type RecruitLeadStatus = components["schemas"]["RecruitLeadStatus"];
type LeadDetailResponse = components["schemas"]["LeadDetailResponse"];

const LEADS_PATH = "/admin/growth-center/leads";

// ─── 招募线索状态流转 ──────────────────────────────────────────────────────────

/** 招募线索跟进状态流转（统一线索表中仅招募行支持写路径）。 */
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

// ─── 线索完整手机号 ────────────────────────────────────────────────────────────

/** 获取招募线索完整手机号（持写权限）。 */
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

// ─── 统一线索详情 ──────────────────────────────────────────────────────────────

/** 获取统一线索详情（归因时间线 + 模块差异化字段），供详情抽屉按需取数。 */
export async function getLeadDetailAction(
  module: GrowthModule,
  leadId: string,
): Promise<ActionResult<LeadDetailResponse>> {
  const perm = await requirePermission(PERMISSION_CODES.RECRUIT_READ);
  if (!perm.ok) return { success: false, error: perm.message };

  try {
    const detail = await getGrowthLeadDetail(module, leadId);
    return { success: true, data: detail };
  } catch (e) {
    logger.error("getLeadDetailAction error:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}
