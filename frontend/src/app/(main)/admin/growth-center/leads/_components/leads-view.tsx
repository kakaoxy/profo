"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQueryStates, parseAsString, parseAsInteger } from "nuqs";
import { useDebouncedCallback } from "use-debounce";
import { Search, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { components } from "@/lib/api-types";
import type { GrowthModule, UnifiedLeadStatus, LeadSource } from "../../types";
import {
  GROWTH_MODULE_META,
  GROWTH_MODULE_ORDER,
  GROWTH_SOURCE_META,
  GROWTH_STATUS_META,
  PHASE_1_LABEL,
  PHASE_2_LABEL,
} from "../../types";
import { LeadsTable } from "./leads-table";
import { LeadDetailSheet } from "./lead-detail-sheet";
import { RecruitKpiGrid, type RecruitKpiItem } from "../../_components/recruit-kpi";
import { DesignPagination } from "../../_components/design-pagination";
import { updateLeadStatusAction } from "../../_lib/growth-actions";
import type { GrowthEmployee, GrowthLeadsKpi } from "../../_lib/growth-data";

type UnifiedLeadListItem = components["schemas"]["UnifiedLeadListItem"];

export interface LeadsViewProps {
  /** 当前页线索（服务端分页 + 筛选后返回） */
  leads: UnifiedLeadListItem[];
  /** 总记录数（服务端返回） */
  total: number;
  /** 当前页码（服务端返回） */
  page: number;
  /** 每页数量（服务端返回） */
  pageSize: number;
  /** 员工列表（归属员工筛选下拉数据源） */
  employees: GrowthEmployee[];
  /** KPI 概览（服务端获取：overview/kpi + source-breakdown total） */
  kpi: GrowthLeadsKpi;
  /** 生效开始日期（URL 为空时为默认近 30 天） */
  effectiveStart: string;
  /** 生效结束日期 */
  effectiveEnd: string;
}

/**
 * 筛选下拉"全部"哨兵值。
 * Radix Select 中空字符串 value 与「未选择」语义重叠（shouldShowPlaceholder 将 '' 视为
 * placeholder 态，选中后触发器显示的是 placeholder 而非选项文本），故统一用哨兵值。
 */
const ALL = "all";

/** 下拉选项值 → URL 查询值（"all" → ""） */
function toQueryValue(value: string): string {
  return value === ALL ? "" : value;
}

/** URL 查询值 → 下拉选项值（"" → "all"） */
function toSelectValue(value: string): string {
  return value === "" ? ALL : value;
}

/** 模块 Tab（全部 + 4 模块，URL 驱动） */
const MODULE_TABS: Array<{ value: string; label: string }> = [
  { value: "", label: "全部" },
  ...GROWTH_MODULE_ORDER.map((m) => ({ value: m as string, label: GROWTH_MODULE_META[m].label })),
];

/** 状态筛选选项（统一 5 态，含"全部"） */
const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: ALL, label: "全部状态" },
  ...(Object.entries(GROWTH_STATUS_META) as Array<[UnifiedLeadStatus, { label: string }]>).map(
    ([value, meta]) => ({ value, label: meta.label }),
  ),
];

/** 来源筛选选项（含"全部"） */
const SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: ALL, label: "全部来源" },
  ...(Object.entries(GROWTH_SOURCE_META) as Array<[LeadSource, { label: string }]>).map(
    ([value, meta]) => ({ value, label: meta.label }),
  ),
];

/** 药丸 Badge 基础样式（与设计稿 .badge 一致） */
const badgeBase =
  "inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-0.5 rounded-full whitespace-nowrap";

/** 状态映射说明（对齐设计稿 Screen 2 文案） */
const STATUS_MAPPING_ROWS: Array<{ module: GrowthModule; text: string }> = [
  {
    module: "valuation",
    text: "待评估 → 新线索 · 待带看 → 已联系 · 已带看 → 意向高 · 已签约 → 已转化 · 已驳回 / 输给竞品 → 已淘汰",
  },
  { module: "booking", text: "已预约 → 新线索（其余预约流程状态不产生线索）" },
  {
    module: "sheet",
    text: "承接估价状态机（待评估 → 新线索 等），通过 referrer 续传归因至来源房源单",
  },
  {
    module: "recruit",
    text: "原生即统一 5 态（新线索 / 已联系 / 意向高 / 已转化 / 已淘汰），无需映射",
  },
];

/**
 * 统一线索管理视图（对齐设计稿 Screen 2）：
 * 筛选/分页由 URL 驱动（nuqs 管理，shallow: false），URL 变化触发
 * Server Component 重新取数。状态流转通过 Server Action 调后端。
 */
export function LeadsView({
  leads,
  total,
  page,
  pageSize,
  employees,
  kpi,
  effectiveStart,
  effectiveEnd,
}: LeadsViewProps) {
  const router = useRouter();

  // 筛选与分页 URL 状态（nuqs 管理，shallow: false → URL 变化触发路由导航与服务端取数）
  const [query, setQuery] = useQueryStates(
    {
      module: parseAsString.withDefault(""),
      employee: parseAsString.withDefault(""),
      status: parseAsString.withDefault(""),
      source: parseAsString.withDefault(""),
      start_date: parseAsString.withDefault(""),
      end_date: parseAsString.withDefault(""),
      search: parseAsString.withDefault(""),
      page: parseAsInteger.withDefault(1),
      page_size: parseAsInteger.withDefault(pageSize),
    },
    { shallow: false },
  );

  // 搜索输入本地状态（防抖 300ms 后写入 URL，避免每次击键触发服务端请求）
  const [searchInput, setSearchInput] = React.useState(query.search);
  const debouncedSetSearch = useDebouncedCallback((value: string) => {
    setQuery({ search: value, page: 1 });
  }, 300);
  // URL 变化（如重置）时同步本地输入
  React.useEffect(() => {
    setSearchInput(query.search);
  }, [query.search]);

  const maxPage = Math.max(1, Math.ceil(total / pageSize));

  // 兜底：服务端返回的 page 越界时回退到末页
  React.useEffect(() => {
    if (page > maxPage && maxPage > 0) {
      setQuery({ page: maxPage });
    }
  }, [page, maxPage, setQuery]);

  // KPI 概览（overview/kpi 四字段 + 来源构成近 30 天合计）
  const kpiItems: RecruitKpiItem[] = React.useMemo(
    () => [
      {
        dotClass: "bg-ink",
        label: "今日新增",
        value: kpi.todayLeads.toLocaleString(),
        trend: { text: "今日留资" },
      },
      {
        dotClass: "bg-rust",
        label: "近 30 天留资",
        value: kpi.last30Leads.toLocaleString(),
        trend: { text: "4 模块合计" },
      },
      {
        dotClass: "bg-apricot-wash",
        label: "有效新客",
        value: kpi.validNew.toLocaleString(),
        trend: { text: "近 30 天 · 已剔除内部" },
      },
      {
        dotClass: "bg-sky-wash",
        label: "待跟进",
        value: kpi.pending.toLocaleString(),
        trend: { text: "状态 = 新线索" },
      },
    ],
    [kpi],
  );

  // 状态流转（仅招募行）：Server Action + router.refresh()
  const [flowingId, setFlowingId] = React.useState<string | null>(null);
  const handleFlow = async (leadId: string, targetStatus: UnifiedLeadStatus) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.unified_status === targetStatus) return;
    setFlowingId(leadId);
    try {
      const result = await updateLeadStatusAction(leadId, targetStatus);
      if (result.success) {
        toast.success(`状态已流转为「${GROWTH_STATUS_META[targetStatus].label}」`);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("网络错误，请稍后重试");
    } finally {
      setFlowingId(null);
    }
  };

  // 重置全部筛选条件
  const handleReset = () => {
    setQuery({
      module: "",
      employee: "",
      status: "",
      source: "",
      start_date: "",
      end_date: "",
      search: "",
      page: 1,
    });
  };

  // 查询（将页码复位）
  const handleQuery = () => {
    setQuery({ page: 1 });
    toast.success("已按当前条件查询");
  };

  // 详情抽屉
  const [detailLead, setDetailLead] = React.useState<UnifiedLeadListItem | null>(null);
  const handleDetail = (lead: UnifiedLeadListItem) => setDetailLead(lead);
  const handleCloseDetail = () => setDetailLead(null);

  return (
    <div className="flex flex-col gap-6">
      {/* 页头：标题 + 描述 + 导出（二期预留） */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
        <div>
          <h1 className="flex items-center gap-2.5 flex-wrap text-[26px] font-medium tracking-[-0.23px] text-ink">
            线索管理
            <span className="inline-flex items-center text-[11px] font-medium px-2 py-0.5 rounded-full bg-fog text-graphite ring-1 ring-inset ring-[#ececee] whitespace-nowrap">
              {PHASE_1_LABEL}
            </span>
          </h1>
          <p className="mt-1.5 text-[15px] text-graphite">
            跨模块统一线索池：估价留资 / 房源预约 / 房源单 / 招募
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            disabled
            className="h-[38px] px-[18px] rounded-[12px] bg-ink text-white text-[14px] font-medium inline-flex items-center gap-1.5 whitespace-nowrap disabled:opacity-35 disabled:cursor-not-allowed"
          >
            导出 CSV
          </button>
          <span className="text-[11px] text-slate whitespace-nowrap">{PHASE_2_LABEL}</span>
        </div>
      </div>

      {/* KPI 概览 */}
      <RecruitKpiGrid items={kpiItems} />

      {/* 状态映射说明折叠面板 */}
      <details className="bg-white rounded-2xl shadow-steep px-5 group">
        <summary className="cursor-pointer list-none flex items-center gap-2 text-[13.5px] font-medium text-ink py-3.5 [&::-webkit-details-marker]:hidden">
          <ChevronRight className="h-4 w-4 text-graphite transition-transform group-open:rotate-90" />
          状态映射说明（原生状态 → 统一 5 态）
        </summary>
        <div className="flex flex-col gap-2.5 pb-4">
          {STATUS_MAPPING_ROWS.map((row) => (
            <div
              key={row.module}
              className="flex items-start gap-2.5 text-[13px] text-graphite leading-[1.7]"
            >
              <span className={`${badgeBase} ${GROWTH_MODULE_META[row.module].badge} shrink-0`}>
                {GROWTH_MODULE_META[row.module].label}
              </span>
              <span>{row.text}</span>
            </div>
          ))}
        </div>
      </details>

      {/* 筛选工具栏 */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 模块 Tab */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {MODULE_TABS.map((tab) => (
            <button
              key={tab.value || "all"}
              type="button"
              onClick={() => setQuery({ module: tab.value, page: 1 })}
              className={cn(
                "h-9 px-4 rounded-full border text-[14px] transition-colors whitespace-nowrap",
                query.module === tab.value
                  ? "bg-ink border-ink text-white font-medium"
                  : "bg-white border-fog text-graphite hover:border-dove",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Select
          value={toSelectValue(query.employee)}
          onValueChange={(val) => setQuery({ employee: toQueryValue(val), page: 1 })}
        >
          <SelectTrigger className="h-9.5 rounded-inputs border-dove bg-white text-[14px] min-w-33">
            <SelectValue placeholder="全部员工" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部员工</SelectItem>
            {employees.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={toSelectValue(query.status)}
          onValueChange={(val) => setQuery({ status: toQueryValue(val), page: 1 })}
        >
          <SelectTrigger className="h-9.5 rounded-inputs border-dove bg-white text-[14px] min-w-33">
            <SelectValue placeholder="全部状态" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={toSelectValue(query.source)}
          onValueChange={(val) => setQuery({ source: toQueryValue(val), page: 1 })}
        >
          <SelectTrigger className="h-9.5 rounded-inputs border-dove bg-white text-[14px] min-w-33">
            <SelectValue placeholder="全部来源" />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="date"
          value={effectiveStart}
          onChange={(e) => setQuery({ start_date: e.target.value, page: 1 })}
          className="h-9.5 rounded-inputs border-dove bg-white text-[14px] w-37.5 focus-visible:ring-ink/30"
          aria-label="开始日期"
        />
        <span className="text-[13px] text-slate">至</span>
        <Input
          type="date"
          value={effectiveEnd}
          onChange={(e) => setQuery({ end_date: e.target.value, page: 1 })}
          className="h-9.5 rounded-inputs border-dove bg-white text-[14px] w-37.5 focus-visible:ring-ink/30"
          aria-label="结束日期"
        />

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 opacity-45 text-graphite pointer-events-none" />
          <Input
            placeholder="搜索归属员工"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              debouncedSetSearch(e.target.value);
            }}
            className="h-9.5 rounded-inputs border-dove bg-white text-[14px] pl-9 w-full sm:w-57.5 focus-visible:ring-ink/30"
          />
        </div>

        <button
          type="button"
          className="text-[14px] font-medium text-ink px-0.5 hover:opacity-60 transition-opacity"
          onClick={handleQuery}
        >
          查询
        </button>
        <button
          type="button"
          className="text-[14px] font-medium text-ink px-0.5 hover:opacity-60 transition-opacity"
          onClick={handleReset}
        >
          重置
        </button>
      </div>

      {/* 统一线索明细卡 */}
      <div className="bg-white rounded-cards shadow-steep overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-fog">
          <div>
            <div className="text-[15px] font-medium text-ink">线索明细</div>
            <div className="mt-0.5 text-[13px] text-graphite">
              手机号已脱敏展示，完整号码仅归属员工可在详情内查看
            </div>
          </div>
          <div className="text-[13px] text-graphite tabular-nums">已显示 {leads.length} 条</div>
        </div>

        <LeadsTable
          leads={leads}
          onFlow={handleFlow}
          onDetail={handleDetail}
          flowingId={flowingId}
        />

        <DesignPagination
          info={`共 ${total.toLocaleString()} 条 · 第 ${page}/${maxPage} 页`}
          page={page}
          totalPages={maxPage}
          onPageChange={(p) => setQuery({ page: p })}
        />
      </div>

      {/* 口径脚注（照设计稿 Screen 2） */}
      <footer className="text-[12px] text-slate leading-[1.9] pt-1">
        ① 手机号已脱敏展示，完整号码仅归属员工可在详情内查看；② 归属以首次留资为准，状态映射自
        2026-08 起生效，历史线索保留原状态展示；③ 活动归因为一期范围：当前仅招募线索支持活动归属，
        其余模块在二期接入 campaign_id
      </footer>

      {/* 线索详情抽屉 */}
      <LeadDetailSheet lead={detailLead} onClose={handleCloseDetail} />
    </div>
  );
}
