"use server";

import { revalidatePath } from "next/cache";
import { fetchClient } from "@/lib/api-server";
import { getAccessTokenFromCookie } from "@/lib/token-refresh-server";
import { getApiUrl } from "@/lib/config";
import { extractApiData } from "@/lib/api-helpers";
import { logger } from "@/lib/logger";
import type { components, paths } from "@/lib/api-types";

type LedgerListResponse = components["schemas"]["LedgerListResponse"];
type LedgerStatsResponse = components["schemas"]["LedgerStatsResponse"];
type CashFlowRecordResponse = components["schemas"]["CashFlowRecordResponse"];
type LedgerRecordCreate = components["schemas"]["LedgerRecordCreate"];
type FinanceLogResponse = components["schemas"]["FinanceLogResponse"];
type FinanceSettlementChangeRequest =
  components["schemas"]["FinanceSettlementChangeRequest"];
type FinanceUnsettleRequest = components["schemas"]["FinanceUnsettleRequest"];
type FinanceSettlementResponse =
  components["schemas"]["FinanceSettlementResponse"];
type ProjectLedgerStatisticsResponse =
  components["schemas"]["ProjectLedgerStatisticsResponse"];

type LedgerListQuery = NonNullable<
  paths["/api/v1/admin/ledger"]["get"]["parameters"]["query"]
>;

export interface LedgerListParams {
  search?: string;
  project_status?: string;
  page?: number;
  page_size?: number;
}

export interface LedgerExportParams {
  search?: string;
  project_status?: string;
}

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; message: string };

/**
 * 获取资金账本项目列表（Server Action，供客户端组件刷新使用）
 */
export async function fetchLedgerList(
  params: LedgerListParams = {},
): Promise<ActionResult<LedgerListResponse>> {
  try {
    const client = await fetchClient();
    const query: LedgerListQuery = {
      page: params.page ?? 1,
      page_size: params.page_size ?? 10,
    };
    if (params.search && params.search.trim()) {
      query.search = params.search.trim();
    }
    if (params.project_status && params.project_status !== "all") {
      query.project_status =
        params.project_status as LedgerListQuery["project_status"];
    }

    const { data, error } = await client.GET("/api/v1/admin/ledger", {
      params: { query },
    });

    if (error) {
      const msg = (error as { detail?: string }).detail || "获取资金账本列表失败";
      return { success: false, message: msg };
    }

    return {
      success: true,
      data: extractApiData<LedgerListResponse>(data),
    };
  } catch (e) {
    logger.error("获取资金账本列表异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 获取资金账本全局汇总（Server Action）
 */
export async function fetchLedgerStats(): Promise<ActionResult<LedgerStatsResponse>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/admin/ledger/stats", {});

    if (error) {
      const msg = (error as { detail?: string }).detail || "获取汇总数据失败";
      return { success: false, message: msg };
    }

    return {
      success: true,
      data: extractApiData<LedgerStatsResponse>(data),
    };
  } catch (e) {
    logger.error("获取资金账本汇总异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 导出资金账本 Excel（返回 ArrayBuffer，客户端转 Blob 下载）
 */
export async function exportLedger(
  params: LedgerExportParams = {},
): Promise<ActionResult<ArrayBuffer>> {
  try {
    const token = await getAccessTokenFromCookie();
    const url = new URL(getApiUrl("/api/v1/admin/ledger/export"));
    if (params.search && params.search.trim()) {
      url.searchParams.set("search", params.search.trim());
    }
    if (params.project_status && params.project_status !== "all") {
      url.searchParams.set("project_status", params.project_status);
    }

    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!res.ok) {
      const msg = `导出失败 (HTTP ${res.status})`;
      return { success: false, message: msg };
    }

    const buffer = await res.arrayBuffer();
    return { success: true, data: buffer };
  } catch (e) {
    logger.error("导出资金账本异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 导出单项目资金账本为 zip（含流水 CSV + 票据图片，返回 ArrayBuffer）
 */
export async function exportProjectLedger(
  projectId: string,
): Promise<ActionResult<ArrayBuffer>> {
  try {
    const token = await getAccessTokenFromCookie();
    const url = new URL(
      getApiUrl(`/api/v1/admin/ledger/${projectId}/export`),
    );

    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!res.ok) {
      const msg = `导出失败 (HTTP ${res.status})`;
      return { success: false, message: msg };
    }

    const buffer = await res.arrayBuffer();
    return { success: true, data: buffer };
  } catch (e) {
    logger.error("导出项目资金账本异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 创建资金账本流水（成功后 revalidatePath 刷新列表）
 */
export async function createRecord(
  data: LedgerRecordCreate,
): Promise<ActionResult<CashFlowRecordResponse>> {
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.POST("/api/v1/admin/ledger", {
      body: data,
    });

    if (error) {
      const msg = (error as { detail?: string }).detail || "创建流水记录失败";
      return { success: false, message: msg };
    }

    revalidatePath("/admin/ledger");
    // 同步刷新项目资金账本页（共享弹窗替换旧 cashflow 弹窗后需保证两处页面都刷新）
    revalidatePath(`/admin/projects/${data.project_id}/cashflow`);
    revalidatePath(`/admin/ledger/${data.project_id}`);
    return {
      success: true,
      data: extractApiData<CashFlowRecordResponse>(resData),
    };
  } catch (e) {
    logger.error("创建资金账本流水异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 删除资金账本流水（软删除）
 *
 * @param recordId  流水记录ID
 * @param projectId 项目ID（传入时同时刷新详情页 `/admin/ledger/{projectId}`）
 */
export async function deleteRecord(
  recordId: string,
  projectId?: string,
): Promise<ActionResult<null>> {
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE(
      "/api/v1/admin/ledger/{record_id}",
      { params: { path: { record_id: recordId } } },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "删除流水记录失败";
      return { success: false, message: msg };
    }

    revalidatePath("/admin/ledger");
    if (projectId) {
      revalidatePath(`/admin/ledger/${projectId}`);
    }
    return { success: true, data: null };
  } catch (e) {
    logger.error("删除资金账本流水异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 获取项目资金账本操作日志（Server Action）
 *
 * @param projectId 项目ID
 */
export async function fetchLogs(
  projectId: string,
): Promise<ActionResult<FinanceLogResponse[]>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/admin/ledger/{project_id}/logs",
      { params: { path: { project_id: projectId } } },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "获取操作日志失败";
      return { success: false, message: msg };
    }

    return {
      success: true,
      data: extractApiData<FinanceLogResponse[]>(data) ?? [],
    };
  } catch (e) {
    logger.error("获取资金账本操作日志异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 获取项目资金账本统计数据（Server Action）
 *
 * @param projectId 项目ID
 */
export async function fetchProjectStatistics(
  projectId: string,
): Promise<ActionResult<ProjectLedgerStatisticsResponse>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/admin/ledger/{project_id}/statistics",
      { params: { path: { project_id: projectId } } },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "获取统计数据失败";
      return { success: false, message: msg };
    }

    return {
      success: true,
      data: extractApiData<ProjectLedgerStatisticsResponse>(data),
    };
  } catch (e) {
    logger.error("获取资金账本统计数据异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 结算项目资金账本（unsettled → settled）
 *
 * @param projectId 项目ID
 * @param data      结算请求（日期 + 说明）
 */
export async function settleProjectLedger(
  projectId: string,
  data: FinanceSettlementChangeRequest,
): Promise<ActionResult<FinanceSettlementResponse>> {
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.POST(
      "/api/v1/admin/ledger/{project_id}/settle",
      { params: { path: { project_id: projectId } }, body: data },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "结算失败";
      return { success: false, message: msg };
    }

    revalidatePath(`/admin/ledger/${projectId}`);
    revalidatePath("/admin/ledger");
    return {
      success: true,
      data: extractApiData<FinanceSettlementResponse>(resData),
    };
  } catch (e) {
    logger.error("结算资金账本异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 反结算项目资金账本（settled → unsettled）
 *
 * @param projectId 项目ID
 * @param data      反结算请求（原因，必填）
 */
export async function unsettleProjectLedger(
  projectId: string,
  data: FinanceUnsettleRequest,
): Promise<ActionResult<FinanceSettlementResponse>> {
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.POST(
      "/api/v1/admin/ledger/{project_id}/unsettle",
      { params: { path: { project_id: projectId } }, body: data },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "反结算失败";
      return { success: false, message: msg };
    }

    revalidatePath(`/admin/ledger/${projectId}`);
    revalidatePath("/admin/ledger");
    return {
      success: true,
      data: extractApiData<FinanceSettlementResponse>(resData),
    };
  } catch (e) {
    logger.error("反结算资金账本异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
