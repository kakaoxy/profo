/**
 * 招募管理 Server Component 数据获取层。
 *
 * 所有函数仅在 Server Component / Server Action 中调用，通过 `fetchClient`
 * （含 httpOnly cookie 鉴权 + 401 自动刷新）访问后端接口。
 * 使用 React.cache 包裹避免同请求内重复请求。
 */

import { cache } from "react";
import { format, subDays } from "date-fns";

import { fetchClient } from "@/lib/api-server";
import { logger } from "@/lib/logger";
import { isRedirectError } from "@/lib/auth/server/session";
import type { components } from "@/lib/api-types";
import type {
  RecruitCampaign,
  RecruitEmployee,
  RecruitFunnelData,
  RecruitLead,
} from "../types";

type RecruitLeadListResponse = components["schemas"]["RecruitLeadListResponse"];
type UserSimpleResponse = components["schemas"]["UserSimpleResponse"];

/** 线索列表查询参数（映射后端 GET /admin/recruit/leads query） */
export interface RecruitLeadsQuery {
  search?: string;
  campaign_id?: string;
  status?: RecruitLead["status"];
  source?: RecruitLead["source"];
  employee_id?: string;
  business_area?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  page_size?: number;
}

/** 漏斗查询参数（映射后端 GET /admin/recruit/leads/funnel query） */
export interface RecruitFunnelQuery {
  campaign_id?: string;
  employee_id?: string;
  start_date?: string;
  end_date?: string;
}

/** 将 Date 格式化为 YYYY-MM-DD */
function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** 将后端 UserSimpleResponse 映射为 UI RecruitEmployee */
function mapEmployee(user: UserSimpleResponse): RecruitEmployee {
  return {
    id: user.id,
    name: user.nickname ?? user.username ?? user.id,
  };
}

// ─── 活动 ──────────────────────────────────────────────────────────────────────

/** 获取活动列表（按创建时间倒序，后端已排序）。 */
export const getRecruitCampaigns = cache(async (): Promise<RecruitCampaign[]> => {
  const client = await fetchClient();
  const { data, error } = await client.GET("/api/v1/admin/recruit/campaigns", {});
  if (error || !data) {
    logger.error("[Recruit] 获取活动列表失败:", error);
    throw new Error("获取活动列表失败");
  }
  return data;
});

// ─── 线索 ──────────────────────────────────────────────────────────────────────

/** 获取线索分页列表（服务端筛选 + 分页）。 */
export const getRecruitLeads = cache(
  async (query: RecruitLeadsQuery): Promise<RecruitLeadListResponse> => {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/admin/recruit/leads", {
      params: {
        query: {
          search: query.search || undefined,
          campaign_id: query.campaign_id || undefined,
          status: query.status,
          source: query.source,
          employee_id: query.employee_id || undefined,
          business_area: query.business_area || undefined,
          start_date: query.start_date || undefined,
          end_date: query.end_date || undefined,
          page: query.page ?? 1,
          page_size: query.page_size ?? 10,
        },
      },
    });
    if (error || !data) {
      logger.error("[Recruit] 获取线索列表失败:", error);
      throw new Error("获取线索列表失败");
    }
    return data;
  },
);

// ─── 漏斗 ──────────────────────────────────────────────────────────────────────

/** 获取 6 级漏斗统计（支持活动/员工/时间区间下钻）。 */
export const getRecruitFunnel = cache(
  async (query: RecruitFunnelQuery): Promise<RecruitFunnelData | null> => {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/admin/recruit/leads/funnel", {
      params: {
        query: {
          campaign_id: query.campaign_id || undefined,
          employee_id: query.employee_id || undefined,
          start_date: query.start_date || undefined,
          end_date: query.end_date || undefined,
        },
      },
    });
    if (error || !data) {
      logger.error("[Recruit] 获取漏斗统计失败:", error);
      throw new Error("获取漏斗统计失败");
    }
    return data;
  },
);

// ─── 员工 ──────────────────────────────────────────────────────────────────────

/** 获取员工列表（用于漏斗员工维度下拉与下钻，来源 GET /users/simple）。 */
export const getRecruitEmployees = cache(async (): Promise<RecruitEmployee[]> => {
  const client = await fetchClient();
  const { data, error } = await client.GET("/api/v1/users/simple", {
    params: { query: { status: "active", page: 1, page_size: 500 } },
  });
  if (error || !data) {
    logger.error("[Recruit] 获取员工列表失败:", error);
    throw new Error("获取员工列表失败");
  }
  return data.items.map(mapEmployee);
});

// ─── 线索页 KPI 概览 ───────────────────────────────────────────────────────────

export interface RecruitLeadsKpi {
  /** 今日新增 */
  todayCount: number;
  /** 累计留资（近 30 天） */
  totalLeads: number;
  /** 有效新客（近 30 天） */
  validNew: number;
  /** 待跟进（status=new） */
  pending: number;
  /** 有效占比 */
  validPct: number;
}

/**
 * 获取线索页 KPI 概览数据。
 *
 * 并行发起 3 个请求：
 * 1. 今日线索计数（leads?start_date=end_date=today&page_size=1 → total）
 * 2. 待跟进计数（leads?status=new&page_size=1 → total）
 * 3. 近 30 天漏斗（funnel → authed/valid_leads）
 *
 * 任一失败时对应指标归零，不阻塞页面渲染。
 */
export const getRecruitLeadsKpi = cache(async (): Promise<RecruitLeadsKpi> => {
  const client = await fetchClient();
  const today = toDateStr(new Date());

  const results = await Promise.allSettled([
    client.GET("/api/v1/admin/recruit/leads", {
      params: { query: { start_date: today, end_date: today, page: 1, page_size: 1 } },
    }),
    client.GET("/api/v1/admin/recruit/leads", {
      params: { query: { status: "new", page: 1, page_size: 1 } },
    }),
    client.GET("/api/v1/admin/recruit/leads/funnel", {
      params: {
        query: {
          start_date: toDateStr(subDays(new Date(), 29)),
          end_date: today,
        },
      },
    }),
  ]);

  // 放行 NEXT_REDIRECT（Server Component 401 重定向）
  for (const r of results) {
    if (r.status === "rejected" && isRedirectError(r.reason)) {
      throw r.reason;
    }
  }

  const todayCount =
    results[0].status === "fulfilled" && results[0].value.data
      ? results[0].value.data.total
      : 0;
  const pending =
    results[1].status === "fulfilled" && results[1].value.data
      ? results[1].value.data.total
      : 0;

  let totalLeads = 0;
  let validNew = 0;
  if (results[2].status === "fulfilled" && results[2].value.data) {
    totalLeads = results[2].value.data.authed;
    validNew = results[2].value.data.valid_leads;
  }

  const validPct = totalLeads > 0 ? (validNew / totalLeads) * 100 : 0;

  return { todayCount, totalLeads, validNew, pending, validPct };
});
