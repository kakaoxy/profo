"use client";

import * as React from "react";
import { useQueryStates, parseAsString, parseAsInteger } from "nuqs";
import { format, subDays } from "date-fns";
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

interface LeadsViewProps {
  /** 全量线索（mock 阶段由 page.tsx 并行获取后传入，已按 created_at 倒序） */
  leads: RecruitLead[];
  /** 活动列表（活动筛选下拉数据源） */
  campaigns: RecruitCampaign[];
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

/** 将 Date 格式化为 YYYY-MM-DD */
function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/** 默认日期区间：近 30 天（与设计稿线索页一致） */
function defaultStartDate(): string {
  return toDateStr(subDays(new Date(), 29));
}
function defaultEndDate(): string {
  return toDateStr(new Date());
}

/**
 * 线索列表视图（第一期）：全部筛选/分页/状态流转均为本地状态模拟，
 * 二期替换为真实接口（各操作处已标注 TODO 注释）。
 * 布局对齐设计稿（Steep）：页头 + KPI 概览 + 筛选工具栏 + 线索明细卡。
 */
export function LeadsView({ leads, campaigns }: LeadsViewProps) {
  // 筛选与分页 URL 状态（nuqs 管理，刷新后保持）
  const [query, setQuery] = useQueryStates(
    {
      search: parseAsString.withDefault(""),
      campaign: parseAsString.withDefault(""),
      status: parseAsString.withDefault(""),
      source: parseAsString.withDefault(""),
      start_date: parseAsString.withDefault(""),
      end_date: parseAsString.withDefault(""),
      page: parseAsInteger.withDefault(1),
      page_size: parseAsInteger.withDefault(10),
    },
    // shallow: true —— mock 阶段筛选为纯客户端本地过滤，URL 变化不触发服务端重渲染
    { shallow: true },
  );

  // 本地线索数据（状态流转乐观更新；二期替换为真实接口后由接口返回驱动）
  const [leadsState, setLeadsState] = React.useState<RecruitLead[]>(leads);

  // 生效日期区间：URL 为空时回退默认近 30 天（输入框展示实际生效值）
  const effectiveStart = query.start_date || defaultStartDate();
  const effectiveEnd = query.end_date || defaultEndDate();

  // KPI 概览（基于全量线索，不受筛选影响）
  const kpiItems: RecruitKpiItem[] = React.useMemo(() => {
    const today = toDateStr(new Date());
    const yesterday = toDateStr(subDays(new Date(), 1));
    const todayCount = leadsState.filter((l) =>
      l.created_at.slice(0, 10) === today,
    ).length;
    const yesterdayCount = leadsState.filter((l) =>
      l.created_at.slice(0, 10) === yesterday,
    ).length;
    const validNew = leadsState.filter((l) => !l.is_internal).length;
    const pending = leadsState.filter((l) => l.status === "new").length;
    const validPct =
      leadsState.length > 0 ? (validNew / leadsState.length) * 100 : 0;

    return [
      {
        dotClass: "bg-ink",
        label: "今日新增",
        value: String(todayCount),
        trend:
          todayCount === yesterdayCount
            ? { text: "较昨日持平" }
            : {
                text: `${todayCount > yesterdayCount ? "▲" : "▼"} ${Math.abs(
                  todayCount - yesterdayCount,
                )} 较昨日`,
                tone: todayCount > yesterdayCount ? "up" : "down",
              },
      },
      {
        dotClass: "bg-rust",
        label: "累计留资",
        value: String(leadsState.length),
        trend: { text: "近 30 天" },
      },
      {
        dotClass: "bg-apricot-wash",
        label: "有效新客",
        value: String(validNew),
        trend: { text: `有效占比 ${validPct.toFixed(1)}%` },
      },
      {
        dotClass: "bg-sky-wash",
        label: "待跟进",
        value: String(pending),
        trend: { text: "24 小时内待处理" },
      },
    ];
  }, [leadsState]);

  // 组合筛选：搜索（手机号/商圈）/ 活动 / 员工 / 状态 / 来源 / 日期区间
  const filtered = React.useMemo(() => {
    const keyword = query.search.trim().toLowerCase();
    return leadsState.filter((lead) => {
      if (
        keyword &&
        !lead.phone_masked.includes(keyword) &&
        !lead.main_business_area.toLowerCase().includes(keyword)
      ) {
        return false;
      }
      if (query.campaign && lead.campaign_id !== query.campaign) {
        return false;
      }
      if (query.status && lead.status !== query.status) {
        return false;
      }
      if (query.source && lead.source !== query.source) {
        return false;
      }
      const date = lead.created_at.slice(0, 10);
      return date >= effectiveStart && date <= effectiveEnd;
    });
  }, [
    leadsState,
    query.search,
    query.campaign,
    query.status,
    query.source,
    effectiveStart,
    effectiveEnd,
  ]);

  // 当前页切片
  const pageItems = React.useMemo(() => {
    const start = (query.page - 1) * query.page_size;
    return filtered.slice(start, start + query.page_size);
  }, [filtered, query.page, query.page_size]);

  // 最大页数（filtered 为空时取 1，避免分页器显示 0/0）
  const maxPage = Math.max(1, Math.ceil(filtered.length / query.page_size));

  // 兜底：筛选结果变化 / 手动改 URL 导致 page 越界时回退到末页
  React.useEffect(() => {
    if (query.page > maxPage) {
      setQuery({ page: maxPage });
    }
  }, [query.page, maxPage, setQuery]);

  // 状态流转：沿 STATUS_FLOW 前进一级（乐观更新本地 state，mock 阶段不落库）
  const handleFlow = (leadId: string) => {
    // TODO(二期): 替换为真实接口 PUT /api/v1/admin/recruit/leads/{id}/status
    const lead = leadsState.find((l) => l.id === leadId);
    if (!lead) return;
    const next = STATUS_FLOW[(STATUS_FLOW.indexOf(lead.status) + 1) % STATUS_FLOW.length];
    setLeadsState((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, status: next } : l)),
    );
    toast.success(`状态已流转为「${RECRUIT_LEAD_STATUS_LABELS[next]}」`);
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

  // 查询（筛选为实时生效，此处将页码复位）
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
            placeholder="搜索手机号/商圈"
            value={query.search}
            onChange={(e) => setQuery({ search: e.target.value, page: 1 })}
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

        <LeadsTable leads={pageItems} onFlow={handleFlow} onDetail={handleDetail} />

        <DesignPagination
          info={`共 ${filtered.length} 条 · 第 ${query.page}/${maxPage} 页`}
          page={query.page}
          totalPages={maxPage}
          onPageChange={(p) => setQuery({ page: p })}
        />
      </div>
    </div>
  );
}
