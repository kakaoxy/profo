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

// ─── 无归属线索兜底员工指派 ────────────────────────────────────────────────

/** 无归属线索兜底员工指派响应（employee_name 为 nickname 缺失回退 username） */
export type LeadAssignResponse = components["schemas"]["LeadAssignResponse"];

/**
 * 管理端为无归属线索指派兜底员工（四模块通用）：
 * 仅当前归属为空（无分享归因）的线索可指派，已归属后端 409 不可改派；
 * 员工需存在、active 且具备后台身份，无效后端 422。
 */
export async function assignGrowthLeadEmployeeAction(
  module: GrowthModule,
  leadId: string,
  employeeId: string,
): Promise<ActionResult<LeadAssignResponse>> {
  const perm = await requirePermission(PERMISSION_CODES.RECRUIT_WRITE);
  if (!perm.ok) return { success: false, error: perm.message };

  try {
    const client = await fetchClient();
    const { data: responseData, error } = await client.PUT(
      "/api/v1/admin/growth-center/leads/{module}/{lead_id}/assign",
      {
        params: { path: { module, lead_id: leadId } },
        body: { employee_id: employeeId },
      },
    );
    if (error || !responseData) {
      return { success: false, error: parseApiError(error).message };
    }
    revalidatePath(LEADS_PATH);
    return { success: true, data: responseData };
  } catch (e) {
    logger.error("assignGrowthLeadEmployeeAction error:", e);
    return { success: false, error: parseNetworkError(e) };
  }
}

// ─── 全局兜底负责人 ────────────────────────────────────────────────────────────

/** 全局兜底负责人设置/清除响应（未设置时两字段均为 null） */
export type GrowthFallbackEmployeeResponse =
  components["schemas"]["GrowthFallbackEmployeeResponse"];

/**
 * 设置/清除全局兜底负责人（兜底链最后一环：分享归因/讲房人均未命中时归属该员工）。
 * 仅影响后续新建留资的兜底归属；employeeId=null 清除设置；无效员工后端 422。
 */
export async function setGrowthFallbackEmployeeAction(
  employeeId: string | null,
): Promise<ActionResult<GrowthFallbackEmployeeResponse>> {
  const perm = await requirePermission(PERMISSION_CODES.RECRUIT_WRITE);
  if (!perm.ok) return { success: false, error: perm.message };

  try {
    const client = await fetchClient();
    const { data: responseData, error } = await client.PUT(
      "/api/v1/admin/growth-center/fallback-employee",
      {
        body: { employee_id: employeeId },
      },
    );
    if (error || !responseData) {
      return { success: false, error: parseApiError(error).message };
    }
    revalidatePath(LEADS_PATH);
    return { success: true, data: responseData };
  } catch (e) {
    logger.error("setGrowthFallbackEmployeeAction error:", e);
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
