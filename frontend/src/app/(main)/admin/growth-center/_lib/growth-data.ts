/**
 * 获客中心（跨模块统一视图）Server Component 数据获取层。
 *
 * 所有函数仅在 Server Component / Server Action 中调用，通过 `fetchClient`
 * （含 httpOnly cookie 鉴权 + 401 自动刷新）访问后端聚合只读端点。
 * 使用 React.cache 包裹避免同请求内重复请求。
 */

import { cache } from "react";

import { fetchClient } from "@/lib/api-server";
import { logger } from "@/lib/logger";
import type { components } from "@/lib/api-types";
import type { GrowthModule, LeadSource, UnifiedLeadStatus } from "../types";

type GrowthOverviewKpiResponse = components["schemas"]["GrowthOverviewKpiResponse"];
type SourceBreakdownResponse = components["schemas"]["SourceBreakdownResponse"];
type TrendResponse = components["schemas"]["TrendResponse"];
type FunnelCompareResponse = components["schemas"]["FunnelCompareResponse"];
type EmployeeTopResponse = components["schemas"]["EmployeeTopResponse"];
type UnifiedLeadListResponse = components["schemas"]["UnifiedLeadListResponse"];
type LeadDetailResponse = components["schemas"]["LeadDetailResponse"];

/** 统一线索列表查询参数（映射后端 GET /admin/growth-center/leads query） */
export interface GrowthLeadsQuery {
  module?: GrowthModule;
  status?: UnifiedLeadStatus;
  employee_id?: string;
  source?: LeadSource;
  start_date?: string;
  end_date?: string;
  search?: string;
  page?: number;
  page_size?: number;
}

/** 员工（筛选下拉数据源，由 GET /api/v1/users/simple 映射） */
export interface GrowthEmployee {
  id: string;
  name: string;
}

/** 线索管理页 KPI 概览（overview/kpi 四字段 + 来源构成近 30 天合计） */
export interface GrowthLeadsKpi {
  /** 今日新增（overview/kpi.today_leads） */
  todayLeads: number;
  /** 近 30 天留资（source-breakdown.total，4 模块合计） */
  last30Leads: number;
  /** 有效新客（overview/kpi.valid_new_customers，近 30 天已剔除内部） */
  validNew: number;
  /** 待跟进（overview/kpi.pending_followups，统一状态=new） */
  pending: number;
}

// ─── 总览 ──────────────────────────────────────────────────────────────────────

/** 获取总览 KPI（今日线索 / 待跟进 / 有效新客 / 整体转化率）。 */
export const getGrowthOverviewKpi = cache(async (): Promise<GrowthOverviewKpiResponse> => {
  const client = await fetchClient();
  const { data, error } = await client.GET("/api/v1/admin/growth-center/overview/kpi", {});
  if (error || !data) {
    logger.error("[GrowthCenter] 获取总览 KPI 失败:", error);
    throw new Error("获取总览 KPI 失败");
  }
  return data;
});

/** 获取线索来源构成（4 模块占比，默认近 30 天）。 */
export const getGrowthSourceBreakdown = cache(
  async (days = 30): Promise<SourceBreakdownResponse> => {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/admin/growth-center/overview/source-breakdown",
      { params: { query: { days } } },
    );
    if (error || !data) {
      logger.error("[GrowthCenter] 获取来源构成失败:", error);
      throw new Error("获取来源构成失败");
    }
    return data;
  },
);

/** 获取逐日线索趋势（窗口内无数据日期补 0，默认近 30 天）。 */
export const getGrowthTrend = cache(async (days = 30): Promise<TrendResponse> => {
  const client = await fetchClient();
  const { data, error } = await client.GET("/api/v1/admin/growth-center/overview/trend", {
    params: { query: { days } },
  });
  if (error || !data) {
    logger.error("[GrowthCenter] 获取线索趋势失败:", error);
    throw new Error("获取线索趋势失败");
  }
  return data;
});

/** 获取四模块漏斗并排对比（默认近 30 天）。 */
export const getGrowthFunnelCompare = cache(async (days = 30): Promise<FunnelCompareResponse> => {
  const client = await fetchClient();
  const { data, error } = await client.GET("/api/v1/admin/growth-center/funnel/compare", {
    params: { query: { days } },
  });
  if (error || !data) {
    logger.error("[GrowthCenter] 获取漏斗对比失败:", error);
    throw new Error("获取漏斗对比失败");
  }
  return data;
});

/** 获取员工获客 TOP 榜（按归因线索数倒序，默认近 30 天前 5 名）。 */
export const getGrowthEmployeeTop = cache(
  async (days = 30, limit = 5): Promise<EmployeeTopResponse> => {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/admin/growth-center/employees/top", {
      params: { query: { days, limit } },
    });
    if (error || !data) {
      logger.error("[GrowthCenter] 获取员工 TOP 榜失败:", error);
      throw new Error("获取员工 TOP 榜失败");
    }
    return data;
  },
);

// ─── 统一线索 ──────────────────────────────────────────────────────────────────

/** 获取统一线索分页列表（服务端筛选 + 分页）。 */
export const getGrowthLeads = cache(
  async (query: GrowthLeadsQuery): Promise<UnifiedLeadListResponse> => {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/admin/growth-center/leads", {
      params: {
        query: {
          module: query.module,
          status: query.status,
          employee_id: query.employee_id || undefined,
          source: query.source,
          start_date: query.start_date || undefined,
          end_date: query.end_date || undefined,
          search: query.search || undefined,
          page: query.page ?? 1,
          page_size: query.page_size ?? 10,
        },
      },
    });
    if (error || !data) {
      logger.error("[GrowthCenter] 获取统一线索列表失败:", error);
      throw new Error("获取统一线索列表失败");
    }
    return data;
  },
);

/**
 * 获取统一线索详情（归因时间线 + 模块差异化字段）。
 *
 * 供线索详情抽屉按需取数（经 Server Action 调用），不做请求级缓存。
 */
export async function getGrowthLeadDetail(
  module: GrowthModule,
  leadId: string,
): Promise<LeadDetailResponse> {
  const client = await fetchClient();
  const { data, error } = await client.GET("/api/v1/admin/growth-center/leads/{module}/{lead_id}", {
    params: { path: { module, lead_id: leadId } },
  });
  if (error || !data) {
    logger.error("[GrowthCenter] 获取线索详情失败:", error);
    throw new Error("获取线索详情失败");
  }
  return data;
}

// ─── 员工 ──────────────────────────────────────────────────────────────────────

/** 获取员工列表（用于归属员工筛选下拉，来源 GET /users/simple）。 */
export const getGrowthEmployees = cache(async (): Promise<GrowthEmployee[]> => {
  const client = await fetchClient();
  const { data, error } = await client.GET("/api/v1/users/simple", {
    params: { query: { status: "active", page: 1, page_size: 500 } },
  });
  if (error || !data) {
    logger.error("[GrowthCenter] 获取员工列表失败:", error);
    throw new Error("获取员工列表失败");
  }
  return data.items.map((user) => ({
    id: user.id,
    name: user.nickname ?? user.username ?? user.id,
  }));
});
