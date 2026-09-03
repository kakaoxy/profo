"use server";

/**
 * 获客中心 Server Actions。
 *
 * 写操作（统一线索状态流转）与敏感读操作（完整手机号、线索详情）经
 * Server Action 层权限校验（requirePermission）后转发后端，状态流转成功后
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

type LeadDetailResponse = components["schemas"]["LeadDetailResponse"];
type MyCustomerStatusUpdateResponse = components["schemas"]["MyCustomerStatusUpdateResponse"];

const LEADS_PATH = "/admin/growth-center/leads";

/**
 * 统一线索状态流转请求体（直接复用后端 MyCustomerStatusUpdateRequest 契约，
 * 禁手写字段，保持前后端一致）
 */
export type GrowthLeadStatusUpdateBody = components["schemas"]["MyCustomerStatusUpdateRequest"];

// ─── 统一线索状态流转 ──────────────────────────────────────────────────────────

/**
 * 统一线索状态流转（四模块，口径与小程序「我的客户」矩阵一致）：
 * recruit/booking 全矩阵；valuation/sheet 仅淘汰（reason 必填）与重新激活（remark 必填），
 * 非法流转后端 409。
 */
export async function updateGrowthLeadStatusAction(
  module: GrowthModule,
  leadId: string,
  body: GrowthLeadStatusUpdateBody,
): Promise<ActionResult<MyCustomerStatusUpdateResponse>> {
  const perm = await requirePermission(PERMISSION_CODES.RECRUIT_WRITE);
  if (!perm.ok) return { success: false, error: perm.message };

  try {
    const client = await fetchClient();
    const { data: responseData, error } = await client.PUT(
      "/api/v1/admin/growth-center/leads/{module}/{lead_id}/status",
      {
        params: { path: { module, lead_id: leadId } },
        body: {
          status: body.status,
          remark: body.remark?.trim() || null,
          reason: body.reason ?? null,
        },
      },
    );
    if (error || !responseData) {
      return { success: false, error: parseApiError(error).message };
    }
    revalidatePath(LEADS_PATH);
    return { success: true, data: responseData };
  } catch (e) {
    logger.error("updateGrowthLeadStatusAction error:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

// ─── 线索完整手机号 ────────────────────────────────────────────────────────────

/**
 * 获取统一线索完整手机号（recruit/booking 解密原生号码，valuation/sheet 取 creator 手机号；
 * 查看不改变任何线索状态）。
 */
export async function getGrowthLeadPhoneAction(
  module: GrowthModule,
  leadId: string,
): Promise<ActionResult<string>> {
  const perm = await requirePermission(PERMISSION_CODES.RECRUIT_WRITE);
  if (!perm.ok) return { success: false, error: perm.message };

  try {
    const client = await fetchClient();
    const { data: responseData, error } = await client.GET(
      "/api/v1/admin/growth-center/leads/{module}/{lead_id}/phone",
      { params: { path: { module, lead_id: leadId } } },
    );
    if (error || !responseData) {
      return { success: false, error: extractErrorMessage(error) };
    }
    return { success: true, data: responseData.phone };
  } catch (e) {
    logger.error("getGrowthLeadPhoneAction error:", e);
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
