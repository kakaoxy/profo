/**
 * 获客中心 · 活动配置 Server Component 数据获取层。
 *
 * 活动管理一期沿用招募业务线后端契约（/admin/recruit/campaigns 与
 * /admin/recruit/leads/funnel），经 `fetchClient`（含 httpOnly cookie 鉴权 +
 * 401 自动刷新）访问；使用 React.cache 避免同请求内重复请求。
 * 写操作见同目录 `campaign-actions.ts`（Server Actions）。
 */

import { cache } from "react";
import { format, subDays } from "date-fns";

import { fetchClient } from "@/lib/api-server";
import { logger } from "@/lib/logger";
import { isRedirectError } from "@/lib/auth/server/session";
import type { components } from "@/lib/api-types";

/** 招募活动（后台响应投影，对齐 RecruitCampaignResponse） */
export type GrowthCampaign = components["schemas"]["RecruitCampaignResponse"];

/** 活动状态（enabled / disabled） */
export type GrowthCampaignStatus = components["schemas"]["RecruitCampaignStatus"];

/** 员工（小程序码归属选择；唯一实现在 ./growth-data.ts，经 GET /users/simple 映射） */
export { getGrowthEmployees } from "./growth-data";
export type { GrowthEmployee } from "./growth-data";

/** KPI 趋势行（up=红涨 / down=绿跌，对齐设计稿 kpi-trend） */
export interface GrowthCampaignTrend {
  text: string;
  tone: "up" | "down";
}

/** 活动页 KPI 概览（近 30 天漏斗口径 + 环比） */
export interface GrowthCampaignStats {
  /** 累计分享次数（近 30 天漏斗） */
  shared: number;
  /** 累计原始留资（近 30 天漏斗） */
  authed: number;
  /** 有效占比（有效新客 ÷ 原始留资，%） */
  validPct: number;
  /** 整体转化率（有效新客 ÷ 分享次数，%） */
  conversion: number;
  /** 分享次数环比 */
  sharedTrend: GrowthCampaignTrend | null;
}

/** 环比趋势文本：无基线时返回 null（展示描述性文案） */
function trendText(cur: number, prev: number): GrowthCampaignTrend | null {
  if (!prev) return null;
  const pct = ((cur - prev) / prev) * 100;
  return {
    text: `${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(1)}% 较上周`,
    tone: pct >= 0 ? "up" : "down",
  };
}

/** 获取活动列表（按创建时间倒序，后端已排序）。 */
export const getGrowthCampaigns = cache(async (): Promise<GrowthCampaign[]> => {
  const client = await fetchClient();
  const { data, error } = await client.GET("/api/v1/admin/recruit/campaigns", {});
  if (error || !data) {
    logger.error("[GrowthCenter] 获取活动列表失败:", error);
    throw new Error("获取活动列表失败");
  }
  return data;
});

/**
 * 获取活动页 KPI 概览：近 30 天与上一周期招募漏斗并行请求，
 * 计算 累计分享 / 累计留资 / 有效占比 / 整体转化率 / 分享环比；
 * 任一请求失败时对应指标归零，不阻塞页面渲染（放行 401 重定向）。
 */
export const getGrowthCampaignStats = cache(async (): Promise<GrowthCampaignStats> => {
  const client = await fetchClient();
  const today = new Date();
  const toDateStr = (d: Date): string => format(d, "yyyy-MM-dd");

  const results = await Promise.allSettled([
    client.GET("/api/v1/admin/recruit/leads/funnel", {
      params: {
        query: { start_date: toDateStr(subDays(today, 29)), end_date: toDateStr(today) },
      },
    }),
    client.GET("/api/v1/admin/recruit/leads/funnel", {
      params: {
        query: {
          start_date: toDateStr(subDays(today, 59)),
          end_date: toDateStr(subDays(today, 30)),
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

  const cur = results[0].status === "fulfilled" ? results[0].value.data : undefined;
  const prev = results[1].status === "fulfilled" ? results[1].value.data : undefined;

  const shared = cur?.share_count ?? 0;
  const authed = cur?.authed ?? 0;
  const validLeads = cur?.valid_leads ?? 0;
  const conversion = shared > 0 ? (validLeads / shared) * 100 : 0;

  return {
    shared,
    authed,
    validPct: authed > 0 ? (validLeads / authed) * 100 : 0,
    conversion,
    sharedTrend: trendText(shared, prev?.share_count ?? 0),
  };
});
