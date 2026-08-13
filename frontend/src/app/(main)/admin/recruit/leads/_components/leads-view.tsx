"use client";

import * as React from "react";
import { useQueryStates, parseAsString, parseAsInteger } from "nuqs";
import { useDebouncedCallback } from "use-debounce";
import { Search } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type {
  RecruitCampaign,
  RecruitLead,
  RecruitLeadStatus,
} from "../../types";
import {
  RECRUIT_LEAD_STATUS_LABELS,
  RECRUIT_SOURCE_LABELS,
} from "../../types";
import { LeadsTable } from "./leads-table";
import { RecruitKpiGrid, type RecruitKpiItem } from "../../_components/recruit-kpi";
import { DesignPagination } from "../../_components/design-pagination";
import { updateLeadStatusAction } from "../../_lib/recruit-actions";
import type { RecruitLeadsKpi } from "../../_lib/recruit-data";

export interface LeadsViewProps {
  /** 当前页线索（服务端分页 + 筛选后返回） */
  leads: RecruitLead[];
  /** 总记录数（服务端返回） */
  total: number;
  /** 当前页码（服务端返回） */
  page: number;
  /** 每页数量（服务端返回） */
  pageSize: number;
  /** 活动列表（活动筛选下拉数据源） */
  campaigns: RecruitCampaign[];
  /** KPI 概览（服务端并行获取） */
  kpi: RecruitLeadsKpi;
  /** 生效开始日期（URL 为空时为默认近 30 天） */
  effectiveStart: string;
  /** 生效结束日期 */
  effectiveEnd: string;
}

/** 筛选下拉"全部"哨兵值（Radix Select 不允许空字符串 value）。 */
const ALL = "all";

/** 下拉选项值 → URL 查询值（"all" → ""） */
function toQueryValue(value: string): string {
  return value === ALL ? "" : value;
}

/** URL 查询值 → 下拉选项值（"" → "all"） */
function toSelectValue(value: string): string {
  return value === "" ? ALL : value;
}

/** 线索状态流转顺序（对齐设计稿 spec-note ④：新线索→已联系→意向高→已转化/已淘汰） */
const STATUS_FLOW: RecruitLeadStatus[] = [
  "new",
  "contacted",
  "high_intent",
  "converted",
  "eliminated",
];

/** 线索状态筛选选项（含"全部"） */
const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: ALL, label: "全部状态" },
  ...Object.entries(RECRUIT_LEAD_STATUS_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

/** 来源筛选选项（含"全部"） */
const SOURCE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: ALL, label: "全部来源" },
  ...Object.entries(RECRUIT_SOURCE_LABELS).map(([value, label]) => ({
    value,
    label,
  })),
];

/**
 * 线索列表视图：筛选/分页由 URL 驱动（nuqs 管理，无 shallow），
 * URL 变化触发 Server Component 重新取数。状态流转通过 Server Action 调后端。
 * 布局对齐设计稿（Steep）：页头 + KPI 概览 + 筛选工具栏 + 线索明细卡。
 */
export function LeadsView({
  leads,
  total,
  page,
  pageSize,
  campaigns,
  kpi,
  effectiveStart,
  effectiveEnd,
}: LeadsViewProps) {
  // 筛选与分页 URL 状态（nuqs 管理，刷新后保持；无 shallow → 触发服务端取数）
  const [query, setQuery] = useQueryStates(
    {
      search: parseAsString.withDefault(""),
      campaign: parseAsString.withDefault(""),
      status: parseAsString.withDefault(""),
      source: parseAsString.withDefault(""),
      start_date: parseAsString.withDefault(""),
      end_date: parseAsString.withDefault(""),
      page: parseAsInteger.withDefault(1),
      page_size: parseAsInteger.withDefault(pageSize),
    },
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

  // KPI 概览（来自服务端并行获取）
  const kpiItems: RecruitKpiItem[] = React.useMemo(
    () => [
      {
        dotClass: "bg-ink",
        label: "今日新增",
        value: String(kpi.todayCount),
        trend: { text: "今日留资" },
      },
      {
        dotClass: "bg-rust",
        label: "累计留资",
        value: String(kpi.totalLeads),
        trend: { text: "近 30 天" },
      },
      {
        dotClass: "bg-apricot-wash",
        label: "有效新客",
        value: String(kpi.validNew),
        trend: { text: `有效占比 ${kpi.validPct.toFixed(1)}%` },
      },
      {
        dotClass: "bg-sky-wash",
        label: "待跟进",
        value: String(kpi.pending),
        trend: { text: "24 小时内待处理" },
      },
    ],
    [kpi],
  );

  // 状态流转：沿 STATUS_FLOW 前进一级（Server Action → revalidatePath 刷新）
  const [flowingId, setFlowingId] = React.useState<string | null>(null);
  const handleFlow = async (leadId: string) => {
    const lead = leads.find((l) => l.id === leadId);
    if (!lead) return;
    const next = STATUS_FLOW[(STATUS_FLOW.indexOf(lead.status) + 1) % STATUS_FLOW.length];
    setFlowingId(leadId);
    try {
      const result = await updateLeadStatusAction(leadId, next);
      if (result.success) {
        toast.success(`状态已流转为「${RECRUIT_LEAD_STATUS_LABELS[next]}」`);
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
      search: "",
      campaign: "",
      status: "",
      source: "",
      start_date: "",
      end_date: "",
      page: 1,
    });
  };

  // 查询（将页码复位）
  const handleQuery = () => {
    setQuery({ page: 1 });
    toast.success("已按当前条件查询");
  };

  // 导出（占位：二期接入真实导出接口）
  const handleExport = () => {
    toast("导出 CSV 二期接入");
  };

  // 详情（占位：二期跳转线索详情页）
  const handleDetail = () => {
    toast("线索详情（含跟进记录）二期接入");
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 页头：标题 + 描述 + 导出 */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-5">
        <div>
          <h1 className="text-[26px] font-medium tracking-[-0.23px] text-ink">
            招募线索
          </h1>
          <p className="mt-1.5 text-[15px] text-graphite">
            客户经员工分享完成授权留资后自动归入此列表，归属以首次留资为准
          </p>
        </div>
        <button
          type="button"
          className="text-[14px] font-medium text-ink px-0.5 hover:opacity-60 transition-opacity self-start sm:self-auto"
          onClick={handleExport}
        >
          导出 CSV
        </button>
      </div>

      {/* KPI 概览 */}
      <RecruitKpiGrid items={kpiItems} />

      {/* 筛选工具栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 opacity-45 text-graphite pointer-events-none" />
          <Input
            placeholder="搜索商圈"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              debouncedSetSearch(e.target.value);
            }}
            className="h-9.5 rounded-inputs border-dove bg-white text-[14px] pl-9 w-full sm:w-57.5 focus-visible:ring-ink/30"
          />
        </div>

        <Select
          value={toSelectValue(query.campaign)}
          onValueChange={(val) =>
            setQuery({ campaign: toQueryValue(val), page: 1 })
          }
        >
          <SelectTrigger className="h-9.5 rounded-inputs border-dove bg-white text-[14px] min-w-33">
            <SelectValue placeholder="全部活动" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>全部活动</SelectItem>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={toSelectValue(query.status)}
          onValueChange={(val) =>
            setQuery({ status: toQueryValue(val), page: 1 })
          }
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
          onValueChange={(val) =>
            setQuery({ source: toQueryValue(val), page: 1 })
          }
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

      {/* 线索明细卡 */}
      <div className="bg-white rounded-cards shadow-steep overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-fog">
          <div>
            <div className="text-[15px] font-medium text-ink">线索明细</div>
            <div className="mt-0.5 text-[13px] text-graphite">
              手机号已脱敏展示，完整号码仅员工个人可见
            </div>
          </div>
        </div>

        <LeadsTable
          leads={leads}
          onFlow={handleFlow}
          onDetail={handleDetail}
          flowingId={flowingId}
        />

        <DesignPagination
          info={`共 ${total} 条 · 第 ${page}/${maxPage} 页`}
          page={page}
          totalPages={maxPage}
          onPageChange={(p) => setQuery({ page: p })}
        />
      </div>
    </div>
  );
}
