"use server";

import { revalidatePath } from "next/cache";
import { fetchClient } from "@/lib/api-server";
import { extractApiData } from "@/lib/api-helpers";
import { logger } from "@/lib/logger";
import type { components, paths } from "@/lib/api-types";
import {
  createRecordSchema,
  projectIdSchema,
  recordIdSchema,
  settleLedgerSchema,
  unsettleLedgerSchema,
  updateRecordSchema,
} from "./_components/ledger-schema";

type LedgerListResponse = components["schemas"]["LedgerListResponse"];
type LedgerStatsResponse = components["schemas"]["LedgerStatsResponse"];
type CashFlowRecordResponse = components["schemas"]["CashFlowRecordResponse"];
type LedgerRecordCreate = components["schemas"]["LedgerRecordCreate"];
type FinanceLogResponse = components["schemas"]["FinanceLogResponse"];
type FinanceSettlementChangeRequest = components["schemas"]["FinanceSettlementChangeRequest"];
type FinanceUnsettleRequest = components["schemas"]["FinanceUnsettleRequest"];
type FinanceSettlementResponse = components["schemas"]["FinanceSettlementResponse"];
type ProjectLedgerStatisticsResponse = components["schemas"]["ProjectLedgerStatisticsResponse"];
type ReceivablePayableResponse = components["schemas"]["ReceivablePayableResponse"];

type LedgerListQuery = NonNullable<paths["/api/v1/admin/ledger"]["get"]["parameters"]["query"]>;

export interface LedgerListParams {
  search?: string;
  project_status?: string;
  page?: number;
  page_size?: number;
}

export type ActionResult<T> = { success: true; data: T } | { success: false; message: string };

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
      query.project_status = params.project_status as LedgerListQuery["project_status"];
    }

    const { data, error } = await client.GET("/api/v1/admin/ledger", {
      params: { query },
    });

    if (error) {
      const msg = (error as { message?: string }).message || "获取资金账本列表失败";
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
      const msg = (error as { message?: string }).message || "获取汇总数据失败";
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
 * 创建资金账本流水（成功后 revalidatePath 刷新列表）
 */
export async function createRecord(
  data: LedgerRecordCreate,
): Promise<ActionResult<CashFlowRecordResponse>> {
  const parsed = createRecordSchema.safeParse(data);
  if (!parsed.success) {
    return {
      success: false,
      message: parsed.error.issues[0]?.message ?? "账本参数不合法",
    };
  }
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.POST("/api/v1/admin/ledger", {
      body: data,
    });

    if (error) {
      const msg = (error as { message?: string }).message || "创建流水记录失败";
      return { success: false, message: msg };
    }

    revalidatePath("/admin/ledger");
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
  const idParsed = recordIdSchema.safeParse(recordId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "账本参数不合法",
    };
  }
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE("/api/v1/admin/ledger/{record_id}", {
      params: { path: { record_id: recordId } },
    });

    if (error) {
      const msg = (error as { message?: string }).message || "删除流水记录失败";
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
 * 更新资金账本流水（补充凭证/支付方类型）
 *
 * @param recordId 流水记录ID
 * @param payload  更新载荷（receipt_urls 追加，counterparty_type 覆盖）
 */
export async function updateRecordAction(
  recordId: string,
  payload: {
    receipt_urls?: string[];
    counterparty_type?: "company" | "individual";
  },
): Promise<ActionResult<CashFlowRecordResponse>> {
  const idParsed = recordIdSchema.safeParse(recordId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "账本参数不合法",
    };
  }
  const patchParsed = updateRecordSchema.safeParse(payload);
  if (!patchParsed.success) {
    return {
      success: false,
      message: patchParsed.error.issues[0]?.message ?? "账本参数不合法",
    };
  }
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.PATCH("/api/v1/admin/ledger/{record_id}", {
      params: { path: { record_id: recordId } },
      body: payload,
    });

    if (error) {
      const msg = (error as { message?: string }).message || "更新流水记录失败";
      return { success: false, message: msg };
    }

    revalidatePath("/admin/ledger");
    return {
      success: true,
      data: extractApiData<CashFlowRecordResponse>(resData),
    };
  } catch (e) {
    logger.error("更新资金账本流水异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 获取项目资金账本操作日志（Server Action）
 *
 * @param projectId 项目ID
 */
export async function fetchLogs(projectId: string): Promise<ActionResult<FinanceLogResponse[]>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/admin/ledger/{project_id}/logs", {
      params: { path: { project_id: projectId } },
    });

    if (error) {
      const msg = (error as { message?: string }).message || "获取操作日志失败";
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
    const { data, error } = await client.GET("/api/v1/admin/ledger/{project_id}/statistics", {
      params: { path: { project_id: projectId } },
    });

    if (error) {
      const msg = (error as { message?: string }).message || "获取统计数据失败";
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
 * 获取项目应收应付参考表（预期 vs 实际对比）
 *
 * @param projectId 项目ID
 */
export async function fetchReceivablePayable(
  projectId: string,
): Promise<ActionResult<ReceivablePayableResponse>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/admin/ledger/{project_id}/receivable-payable",
      { params: { path: { project_id: projectId } } },
    );

    if (error) {
      const msg = (error as { message?: string }).message || "获取应收应付数据失败";
      return { success: false, message: msg };
    }

    return {
      success: true,
      data: extractApiData<ReceivablePayableResponse>(data),
    };
  } catch (e) {
    logger.error("获取应收应付参考表异常:", e);
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
  const idParsed = projectIdSchema.safeParse(projectId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "账本参数不合法",
    };
  }
  const bodyParsed = settleLedgerSchema.safeParse(data);
  if (!bodyParsed.success) {
    return {
      success: false,
      message: bodyParsed.error.issues[0]?.message ?? "账本参数不合法",
    };
  }
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.POST("/api/v1/admin/ledger/{project_id}/settle", {
      params: { path: { project_id: projectId } },
      body: data,
    });

    if (error) {
      const msg = (error as { message?: string }).message || "结算失败";
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
  const idParsed = projectIdSchema.safeParse(projectId);
  if (!idParsed.success) {
    return {
      success: false,
      message: idParsed.error.issues[0]?.message ?? "账本参数不合法",
    };
  }
  const bodyParsed = unsettleLedgerSchema.safeParse(data);
  if (!bodyParsed.success) {
    return {
      success: false,
      message: bodyParsed.error.issues[0]?.message ?? "账本参数不合法",
    };
  }
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.POST(
      "/api/v1/admin/ledger/{project_id}/unsettle",
      { params: { path: { project_id: projectId } }, body: data },
    );

    if (error) {
      const msg = (error as { message?: string }).message || "反结算失败";
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
