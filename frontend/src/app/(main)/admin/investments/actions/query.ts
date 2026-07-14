"use server";

import { fetchClient } from "@/lib/api-server";
import { getAccessTokenFromCookie } from "@/lib/token-refresh-server";
import { getApiUrl } from "@/lib/config";
import { extractApiData } from "@/lib/api-helpers";
import { logger } from "@/lib/logger";
import type { components } from "@/lib/api-types";
import type {
  ActionResult,
  ExportParams,
  InvestmentListParams,
  InvestmentListQuery,
  InvestmentListResponse,
  InvestmentStatsResponse,
  InvestmentResponse,
  ProjectBrief,
  ProjectListResponse,
} from "./types";

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
      const msg = (error as { message?: string }).message || "获取跟投列表失败";
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
      const msg = (error as { message?: string }).message || "获取汇总数据失败";
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
    if (!token) {
      return { success: false, message: "登录已过期，请重新登录" };
    }
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
      const msg = (error as { message?: string }).message || "搜索项目失败";
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
      const msg = (error as { message?: string }).message || "获取跟投详情失败";
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
 * 按项目ID获取项目简要信息（用于新增跟投弹窗预选项目）
 */
export async function getProjectBriefById(
  projectId: string,
): Promise<ActionResult<ProjectBrief>> {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/projects/{project_id}",
      { params: { path: { project_id: projectId } } },
    );

    if (error) {
      const msg = (error as { message?: string }).message || "获取项目信息失败";
      return { success: false, message: msg };
    }

    const p = extractApiData<
      components["schemas"]["ProjectResponse"]
    >(data);
    if (!p) {
      return { success: false, message: "项目不存在" };
    }

    const brief: ProjectBrief = {
      id: p.id,
      name: p.name ?? "",
      community_name: p.community_name ?? null,
      address: p.address ?? null,
      status: p.status ?? null,
      project_code: p.contract_no ?? null,
    };

    return { success: true, data: brief };
  } catch (e) {
    logger.error("获取项目信息异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
