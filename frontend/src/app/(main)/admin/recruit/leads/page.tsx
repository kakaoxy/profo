import { format, subDays } from "date-fns";
import {
  getRecruitLeads,
  getRecruitCampaigns,
  getRecruitLeadsKpi,
  type RecruitLeadsQuery,
} from "../_lib/recruit-data";
import { LeadsView, type LeadsViewProps } from "./_components/leads-view";
import type { RecruitLeadStatus, RecruitSource } from "../types";

/** 将 Date 格式化为 YYYY-MM-DD */
function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

interface PageProps {
  searchParams: Promise<{
    search?: string;
    campaign?: string;
    status?: string;
    source?: string;
    start_date?: string;
    end_date?: string;
    page?: string;
    page_size?: string;
  }>;
}

const DEFAULT_PAGE_SIZE = 10;
const VALID_STATUSES = ["new", "contacted", "high_intent", "converted", "eliminated"];
const VALID_SOURCES = ["card", "poster"];

/**
 * 线索列表页（招募管理 · 区域伙伴招募计划）
 *
 * Server Component：从 URL searchParams 读取筛选条件，并行获取线索分页列表、
 * 活动下拉、KPI 概览。筛选/分页由 URL 驱动（nuqs 管理客户端 URL 状态），
 * URL 变化触发 RSC 重新渲染并服务端取数。
 */
export default async function RecruitLeadsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const page = Math.max(1, Number(params.page) || 1);
  const page_size = Math.max(1, Number(params.page_size) || DEFAULT_PAGE_SIZE);

  // 筛选条件：空字符串 → undefined（不传给后端）
  const status =
    params.status && VALID_STATUSES.includes(params.status)
      ? (params.status as RecruitLeadStatus)
      : undefined;
  const source =
    params.source && VALID_SOURCES.includes(params.source)
      ? (params.source as RecruitSource)
      : undefined;

  // 日期区间：URL 为空时默认近 30 天
  const today = new Date();
  const effectiveStart = params.start_date || toDateStr(subDays(today, 29));
  const effectiveEnd = params.end_date || toDateStr(today);

  const query: RecruitLeadsQuery = {
    search: params.search || undefined,
    campaign_id: params.campaign || undefined,
    status,
    source,
    start_date: effectiveStart,
    end_date: effectiveEnd,
    page,
    page_size,
  };

  // 并行获取数据，避免请求瀑布
  const [leadsResponse, campaigns, kpi] = await Promise.all([
    getRecruitLeads(query),
    getRecruitCampaigns(),
    getRecruitLeadsKpi(),
  ]);

  const viewProps: LeadsViewProps = {
    leads: leadsResponse.items,
    total: leadsResponse.total,
    page: leadsResponse.page,
    pageSize: leadsResponse.page_size,
    campaigns,
    kpi,
    effectiveStart,
    effectiveEnd,
  };

  return (
    <div className="min-h-screen bg-fog">
      <div className="w-full max-w-300 mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <LeadsView {...viewProps} />
      </div>
    </div>
  );
}
