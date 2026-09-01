import { format, subDays } from "date-fns";

import {
  getGrowthEmployees,
  getGrowthLeads,
  getGrowthOverviewKpi,
  getGrowthSourceBreakdown,
  type GrowthLeadsQuery,
} from "../_lib/growth-data";
import { LeadsView, type LeadsViewProps } from "./_components/leads-view";
import type { GrowthModule, LeadSource, UnifiedLeadStatus } from "../types";

/** 将 Date 格式化为 YYYY-MM-DD */
function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** 解析正整数 URL 参数（非整数/越界一律回退默认值，避免透传后端触发 422） */
function toPositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : fallback;
}

/** 校验 YYYY-MM-DD 日期参数（格式非法或不存在该日期时回退默认窗口） */
function toValidDateStr(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    return undefined;
  }
  return value;
}

interface PageProps {
  searchParams: Promise<{
    module?: string;
    employee?: string;
    status?: string;
    source?: string;
    start_date?: string;
    end_date?: string;
    search?: string;
    page?: string;
    page_size?: string;
  }>;
}

const DEFAULT_PAGE_SIZE = 10;
/** 分页上限，对齐后端 pagination 依赖（le=settings.max_page_size=200） */
const MAX_PAGE_SIZE = 200;
const VALID_MODULES: GrowthModule[] = ["valuation", "booking", "sheet", "recruit"];
const VALID_STATUSES: UnifiedLeadStatus[] = [
  "new",
  "contacted",
  "high_intent",
  "converted",
  "eliminated",
];
const VALID_SOURCES: LeadSource[] = ["card", "poster", "direct"];

/**
 * 统一线索管理页（获客中心 · 对齐设计稿 Screen 2）。
 *
 * Server Component：从 URL searchParams 读取筛选条件，并行获取统一线索分页列表、
 * 员工下拉、KPI 概览（overview/kpi + source-breakdown 合计）。筛选/分页由 URL 驱动
 * （nuqs 管理客户端 URL 状态），URL 变化触发 RSC 重新渲染并服务端取数。
 */
export default async function GrowthLeadsPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const page = toPositiveInt(params.page, 1);
  // 上下限均收敛：URL 被篡改为超大/非整数 page_size 时避免透传后端触发 422 导致整页错误
  const page_size = Math.min(MAX_PAGE_SIZE, toPositiveInt(params.page_size, DEFAULT_PAGE_SIZE));

  // 枚举校验：非法值视为未筛选
  const moduleFilter =
    params.module && VALID_MODULES.includes(params.module as GrowthModule)
      ? (params.module as GrowthModule)
      : undefined;
  const status =
    params.status && VALID_STATUSES.includes(params.status as UnifiedLeadStatus)
      ? (params.status as UnifiedLeadStatus)
      : undefined;
  const source =
    params.source && VALID_SOURCES.includes(params.source as LeadSource)
      ? (params.source as LeadSource)
      : undefined;

  // 日期区间：URL 为空或非法时默认近 30 天
  const today = new Date();
  const effectiveStart = toValidDateStr(params.start_date) ?? toDateStr(subDays(today, 29));
  const effectiveEnd = toValidDateStr(params.end_date) ?? toDateStr(today);

  const query: GrowthLeadsQuery = {
    module: moduleFilter,
    status,
    source,
    employee_id: params.employee || undefined,
    search: params.search || undefined,
    start_date: effectiveStart,
    end_date: effectiveEnd,
    page,
    page_size,
  };

  // 并行获取数据，避免请求瀑布
  const [leadsResponse, employees, overviewKpi, breakdown] = await Promise.all([
    getGrowthLeads(query),
    getGrowthEmployees(),
    getGrowthOverviewKpi(),
    getGrowthSourceBreakdown(30),
  ]);

  const viewProps: LeadsViewProps = {
    leads: leadsResponse.items,
    total: leadsResponse.total,
    page: leadsResponse.page,
    pageSize: leadsResponse.page_size,
    employees,
    kpi: {
      todayLeads: overviewKpi.today_leads,
      last30Leads: breakdown.total,
      validNew: overviewKpi.valid_new_customers,
      pending: overviewKpi.pending_followups,
    },
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
