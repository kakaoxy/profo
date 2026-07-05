"use server";

import { revalidatePath } from "next/cache";
import { fetchClient } from "@/lib/api-server";
import { getAccessTokenFromCookie } from "@/lib/token-refresh-server";
import { getApiUrl } from "@/lib/config";
import { extractApiData } from "@/lib/api-helpers";
import { logger } from "@/lib/logger";
import type { components, paths } from "@/lib/api-types";

type InvestmentListResponse = components["schemas"]["InvestmentListResponse"];
type InvestmentStatsResponse = components["schemas"]["InvestmentStatsResponse"];
type InvestmentResponse = components["schemas"]["InvestmentResponse"];
type InvestmentCreate = components["schemas"]["InvestmentCreate"];
type InvestmentUpdate = components["schemas"]["InvestmentUpdate"];
type InvestorCreate = components["schemas"]["InvestorCreate"];
type InvestorUpdate = components["schemas"]["InvestorUpdate"];
type InvestorResponse = components["schemas"]["InvestorResponse"];
type ReturnAdjustmentBatchRequest =
  components["schemas"]["ReturnAdjustmentBatchRequest"];
type ReturnAdjustmentItem = components["schemas"]["ReturnAdjustmentItem"];
type ReturnAdjustmentResponse = components["schemas"]["ReturnAdjustmentResponse"];
type SettlementChangeRequest = components["schemas"]["SettlementChangeRequest"];
type UnsettleRequest = components["schemas"]["UnsettleRequest"];
type CopyInvestmentRequest = components["schemas"]["CopyInvestmentRequest"];
type ProjectListResponse =
  paths["/api/v1/projects"]["get"]["responses"][200]["content"]["application/json"];

type InvestmentListQuery = NonNullable<
  paths["/api/v1/admin/investments"]["get"]["parameters"]["query"]
>;

export interface InvestmentListParams {
  search?: string;
  project_status?: string;
  settlement_status?: string;
  page?: number;
  page_size?: number;
}

export interface ExportParams {
  search?: string;
  project_status?: string;
  settlement_status?: string;
}

export interface ProjectBrief {
  id: string;
  name: string;
  community_name?: string | null;
  address?: string | null;
  status?: string | null;
  project_code?: string | null;
}

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; message: string };

/**
 * 获取跟投记录列表（Server Action，供客户端组件刷新使用）
 */
export async function fetchInvestmentList(
  params: InvestmentListParams = {},
): Promise<ActionResult<InvestmentListResponse>> {
  try {
    const client = await fetchClient();
    const query: InvestmentListQuery = {
      page: params.page ?? 1,
      page_size: params.page_size ?? 10,
    };
    if (params.search && params.search.trim()) {
      query.search = params.search.trim();
    }
    if (params.project_status && params.project_status !== "all") {
      query.project_status =
        params.project_status as InvestmentListQuery["project_status"];
    }
    if (params.settlement_status && params.settlement_status !== "all") {
      query.settlement_status =
        params.settlement_status as InvestmentListQuery["settlement_status"];
    }

    const { data, error } = await client.GET("/api/v1/admin/investments", {
      params: { query },
    });

    if (error) {
      const msg = (error as { detail?: string }).detail || "获取跟投列表失败";
      return { success: false, message: msg };
    }

    return {
      success: true,
      data: extractApiData<InvestmentListResponse>(data),
    };
  } catch (e) {
    logger.error("获取跟投列表异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 获取跟投汇总卡片（Server Action）
 */
export async function fetchInvestmentStats(): Promise<ActionResult<InvestmentStatsResponse>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/admin/investments/stats", {});

    if (error) {
      const msg = (error as { detail?: string }).detail || "获取汇总数据失败";
      return { success: false, message: msg };
    }

    return {
      success: true,
      data: extractApiData<InvestmentStatsResponse>(data),
    };
  } catch (e) {
    logger.error("获取跟投汇总异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 导出跟投列表 Excel（返回 ArrayBuffer，客户端转 Blob 下载）
 */
export async function exportInvestments(
  params: ExportParams = {},
): Promise<ActionResult<ArrayBuffer>> {
  try {
    const token = await getAccessTokenFromCookie();
    const url = new URL(getApiUrl("/api/v1/admin/investments/export"));
    if (params.search && params.search.trim()) {
      url.searchParams.set("search", params.search.trim());
    }
    if (params.project_status && params.project_status !== "all") {
      url.searchParams.set("project_status", params.project_status);
    }
    if (params.settlement_status && params.settlement_status !== "all") {
      url.searchParams.set("settlement_status", params.settlement_status);
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
    logger.error("导出跟投列表异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 创建跟投记录（成功后 revalidatePath 刷新列表）
 */
export async function createInvestment(
  data: InvestmentCreate,
): Promise<ActionResult<InvestmentResponse>> {
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.POST("/api/v1/admin/investments", {
      body: data,
    });

    if (error) {
      const msg = (error as { detail?: string }).detail || "创建跟投记录失败";
      return { success: false, message: msg };
    }

    revalidatePath("/admin/investments");
    return {
      success: true,
      data: extractApiData<InvestmentResponse>(resData),
    };
  } catch (e) {
    logger.error("创建跟投记录异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 搜索项目（用于新增跟投弹窗的项目选择器）
 * 调用 GET /api/v1/projects?community_name=xxx
 */
export async function searchProjects(
  keyword: string,
): Promise<ActionResult<ProjectBrief[]>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/projects", {
      params: {
        query: {
          page: 1,
          page_size: 20,
          ...(keyword.trim() ? { community_name: keyword.trim() } : {}),
        },
      },
    });

    if (error) {
      const msg = (error as { detail?: string }).detail || "搜索项目失败";
      return { success: false, message: msg };
    }

    const listData = extractApiData<ProjectListResponse>(data);
    const items = (listData?.items ?? []).map((p): ProjectBrief => ({
      id: p.id,
      name: p.name ?? "",
      community_name: p.community_name ?? null,
      address: p.address ?? null,
      status: p.status ?? null,
      project_code: p.contract_no ?? null,
    }));

    return { success: true, data: items };
  } catch (e) {
    logger.error("搜索项目异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 获取跟投记录详情（Server Action，供客户端组件刷新使用）
 * 调用 GET /api/v1/admin/investments/{id}，返回 InvestmentResponse（含投资方树 + 操作日志）
 */
export async function fetchInvestmentDetail(
  id: string,
): Promise<ActionResult<InvestmentResponse>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/admin/investments/{investment_id}",
      { params: { path: { investment_id: id } } },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "获取跟投详情失败";
      return { success: false, message: msg };
    }

    return {
      success: true,
      data: extractApiData<InvestmentResponse>(data),
    };
  } catch (e) {
    logger.error("获取跟投详情异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 更新跟投记录基础信息（投资总额 / 收益总额 / 备注）
 * 调用 PUT /api/v1/admin/investments/{id}。仅 unsettled 可改；改总额触发后端金额重算。
 */
export async function updateInvestment(
  id: string,
  data: InvestmentUpdate,
): Promise<ActionResult<InvestmentResponse>> {
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.PUT(
      "/api/v1/admin/investments/{investment_id}",
      { params: { path: { investment_id: id } }, body: data },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "更新跟投记录失败";
      return { success: false, message: msg };
    }

    revalidatePath(`/admin/investments/${id}`);
    revalidatePath("/admin/investments");
    return {
      success: true,
      data: extractApiData<InvestmentResponse>(resData),
    };
  } catch (e) {
    logger.error("更新跟投记录异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 添加投资方（含子投资人）
 * 调用 POST /api/v1/admin/investments/{id}/investors。
 */
export async function addInvestor(
  investmentId: string,
  data: InvestorCreate,
): Promise<ActionResult<InvestorResponse>> {
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.POST(
      "/api/v1/admin/investments/{investment_id}/investors",
      { params: { path: { investment_id: investmentId } }, body: data },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "添加投资方失败";
      return { success: false, message: msg };
    }

    revalidatePath(`/admin/investments/${investmentId}`);
    return {
      success: true,
      data: extractApiData<InvestorResponse>(resData),
    };
  } catch (e) {
    logger.error("添加投资方异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 更新投资方（sub_investors 整体替换）
 * 调用 PUT /api/v1/admin/investments/{id}/investors/{investor_id}。
 */
export async function updateInvestor(
  investmentId: string,
  investorId: string,
  data: InvestorUpdate,
): Promise<ActionResult<InvestorResponse>> {
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.PUT(
      "/api/v1/admin/investments/{investment_id}/investors/{investor_id}",
      {
        params: {
          path: { investment_id: investmentId, investor_id: investorId },
        },
        body: data,
      },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "更新投资方失败";
      return { success: false, message: msg };
    }

    revalidatePath(`/admin/investments/${investmentId}`);
    return {
      success: true,
      data: extractApiData<InvestorResponse>(resData),
    };
  } catch (e) {
    logger.error("更新投资方异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 删除投资方（级联删除子投资人）
 * 调用 DELETE /api/v1/admin/investments/{id}/investors/{investor_id}。
 */
export async function deleteInvestor(
  investmentId: string,
  investorId: string,
): Promise<ActionResult<null>> {
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE(
      "/api/v1/admin/investments/{investment_id}/investors/{investor_id}",
      {
        params: {
          path: { investment_id: investmentId, investor_id: investorId },
        },
      },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "删除投资方失败";
      return { success: false, message: msg };
    }

    revalidatePath(`/admin/investments/${investmentId}`);
    return { success: true, data: null };
  } catch (e) {
    logger.error("删除投资方异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 批量保存分配比例调整
 * 调用 PUT /api/v1/admin/investments/{id}/distribution-adjustments。
 * 校验由后端执行（分配比例合计 = 100%）。
 */
export async function adjustDistribution(
  investmentId: string,
  adjustments: ReturnAdjustmentItem[],
): Promise<ActionResult<ReturnAdjustmentResponse[]>> {
  try {
    const client = await fetchClient();
    const body: ReturnAdjustmentBatchRequest = { adjustments };
    const { data: resData, error } = await client.PUT(
      "/api/v1/admin/investments/{investment_id}/distribution-adjustments",
      { params: { path: { investment_id: investmentId } }, body },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "调整分配比例失败";
      return { success: false, message: msg };
    }

    revalidatePath(`/admin/investments/${investmentId}`);
    revalidatePath("/admin/investments");
    return {
      success: true,
      data: extractApiData<ReturnAdjustmentResponse[]>(resData),
    };
  } catch (e) {
    logger.error("调整分配比例异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 结算跟投记录（unsettled → settled）
 * 调用 POST /api/v1/admin/investments/{id}/settle。
 */
export async function settleInvestment(
  investmentId: string,
  data: SettlementChangeRequest,
): Promise<ActionResult<InvestmentResponse>> {
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.POST(
      "/api/v1/admin/investments/{investment_id}/settle",
      { params: { path: { investment_id: investmentId } }, body: data },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "结算失败";
      return { success: false, message: msg };
    }

    revalidatePath(`/admin/investments/${investmentId}`);
    revalidatePath("/admin/investments");
    return {
      success: true,
      data: extractApiData<InvestmentResponse>(resData),
    };
  } catch (e) {
    logger.error("结算跟投记录异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 反结算跟投记录（settled → unsettled）
 * 调用 POST /api/v1/admin/investments/{id}/unsettle。
 */
export async function unsettleInvestment(
  investmentId: string,
  data: UnsettleRequest,
): Promise<ActionResult<InvestmentResponse>> {
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.POST(
      "/api/v1/admin/investments/{investment_id}/unsettle",
      { params: { path: { investment_id: investmentId } }, body: data },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "反结算失败";
      return { success: false, message: msg };
    }

    revalidatePath(`/admin/investments/${investmentId}`);
    revalidatePath("/admin/investments");
    return {
      success: true,
      data: extractApiData<InvestmentResponse>(resData),
    };
  } catch (e) {
    logger.error("反结算跟投记录异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 软删除跟投记录
 * 调用 DELETE /api/v1/admin/investments/{id}。
 */
export async function deleteInvestment(
  investmentId: string,
): Promise<ActionResult<null>> {
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE(
      "/api/v1/admin/investments/{investment_id}",
      { params: { path: { investment_id: investmentId } } },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "删除跟投记录失败";
      return { success: false, message: msg };
    }

    revalidatePath("/admin/investments");
    return { success: true, data: null };
  } catch (e) {
    logger.error("删除跟投记录异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 复制跟投配置到目标项目
 * 调用 POST /api/v1/admin/investments/{id}/copy。返回新创建的跟投记录。
 */
export async function copyInvestment(
  investmentId: string,
  data: CopyInvestmentRequest,
): Promise<ActionResult<InvestmentResponse>> {
  try {
    const client = await fetchClient();
    const { data: resData, error } = await client.POST(
      "/api/v1/admin/investments/{investment_id}/copy",
      { params: { path: { investment_id: investmentId } }, body: data },
    );

    if (error) {
      const msg = (error as { detail?: string }).detail || "复制跟投配置失败";
      return { success: false, message: msg };
    }

    revalidatePath("/admin/investments");
    return {
      success: true,
      data: extractApiData<InvestmentResponse>(resData),
    };
  } catch (e) {
    logger.error("复制跟投配置异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
