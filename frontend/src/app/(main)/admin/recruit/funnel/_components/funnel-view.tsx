"use client";

import { useRouter } from "next/navigation";
import { useQueryStates, parseAsString } from "nuqs";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type {
  RecruitCampaign,
  RecruitEmployee,
  RecruitFunnelData,
} from "../../types";
import { FunnelStats } from "./funnel-stats";
import { FunnelEmployees, type EmployeeFunnelRow } from "./funnel-employees";

/** Select 中「全部」的占位值（Radix Select 不允许空字符串 value，故用 "all"） */
const ALL = "all";

/** 时间区间快捷选项 */
const RANGE_OPTIONS = [
  { value: "7", label: "近 7 天" },
  { value: "30", label: "近 30 天" },
  { value: "90", label: "近 90 天" },
  { value: "custom", label: "自定义区间" },
] as const;

export interface FunnelViewProps {
  /** 员工维度选项 */
  employees: RecruitEmployee[];
  /** 活动维度选项 */
  campaigns: RecruitCampaign[];
  /** 整体漏斗数据（服务端获取） */
  funnel: RecruitFunnelData | null;
  /** 员工维度漏斗行（服务端获取，已按选中员工过滤） */
  employeeRows: EmployeeFunnelRow[];
  /** 当前选中的活动 ID（空 = 全部） */
  campaignId: string;
  /** 当前选中的员工 ID（空 = 全部） */
  employeeId: string;
  /** 当前时间区间 */
  range: string;
  /** 自定义区间开始日期 */
  customStart: string;
  /** 自定义区间结束日期 */
  customEnd: string;
  /** 日期区间展示文本 */
  dateRange: string;
}

/**
 * 漏斗看板（对齐设计稿 F3）：
 * 页头右侧查询条件（活动 / 员工 / 时间区间 / 刷新），
 * 数据区为转化漏斗主卡 + 员工维度拉新贡献表。
 * 筛选条件变化通过 nuqs 更新 URL，触发 Server Component 重新取数。
 */
export function FunnelView({
  employees,
  campaigns,
  funnel,
  employeeRows,
  campaignId,
  employeeId,
  range,
  customStart,
  customEnd,
  dateRange,
}: FunnelViewProps) {
  const router = useRouter();

  // URL 状态（nuqs 管理，无 shallow → 触发服务端取数）
  const [, setQuery] = useQueryStates({
    campaign: parseAsString.withDefault(""),
    employee: parseAsString.withDefault(""),
    range: parseAsString.withDefault("30"),
    start_date: parseAsString.withDefault(""),
    end_date: parseAsString.withDefault(""),
  });

  const rangeLabel =
    range === "custom" ? "自定义区间" : `近 ${range} 天`;

  // 日期区间校验：自定义区间开始日期晚于结束日期时阻止更新
  const validateCustomRange = (start: string, end: string): boolean => {
    if (start && end && start > end) {
      toast.error("开始日期不能晚于结束日期");
      return false;
    }
    return true;
  };

  const handleCampaignChange = (val: string) => {
    setQuery({ campaign: val === ALL ? "" : val });
  };

  const handleEmployeeChange = (val: string) => {
    setQuery({ employee: val === ALL ? "" : val });
  };

  const handleRangeChange = (val: string) => {
    setQuery({ range: val });
  };

  const handleCustomStartChange = (val: string) => {
    if (!validateCustomRange(val, customEnd)) return;
    setQuery({ start_date: val });
  };

  const handleCustomEndChange = (val: string) => {
    if (!validateCustomRange(customStart, val)) return;
    setQuery({ end_date: val });
  };

  const handleRefresh = () => {
    router.refresh();
    toast.success("漏斗数据已刷新");
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 页头：标题 + 描述 + 查询工具栏 */}
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
        <div>
          <h1 className="text-[26px] font-medium tracking-[-0.23px] text-ink">
            招募漏斗
          </h1>
          <p className="mt-1.5 text-[15px] text-graphite">
            6 级核心漏斗：分享 → 打开 → 深度浏览(≥3s) → 点击授权 → 授权成功 → 有效新客
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={campaignId || ALL}
            onValueChange={handleCampaignChange}
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
            value={employeeId || ALL}
            onValueChange={handleEmployeeChange}
          >
            <SelectTrigger className="h-9.5 rounded-inputs border-dove bg-white text-[14px] min-w-33">
              <SelectValue placeholder="全部员工" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>全部员工</SelectItem>
              {employees.map((emp) => (
                <SelectItem key={emp.id} value={emp.id}>
                  {emp.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={range}
            onValueChange={handleRangeChange}
          >
            <SelectTrigger className="h-9.5 rounded-inputs border-dove bg-white text-[14px] min-w-28">
              <SelectValue placeholder="近 30 天" />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {range === "custom" && (
            <>
              <Input
                type="date"
                value={customStart}
                onChange={(e) => handleCustomStartChange(e.target.value)}
                className="h-9.5 rounded-inputs border-dove bg-white text-[14px] w-37.5 focus-visible:ring-ink/30"
                aria-label="开始日期"
              />
              <span className="text-[13px] text-slate">至</span>
              <Input
                type="date"
                value={customEnd}
                onChange={(e) => handleCustomEndChange(e.target.value)}
                className="h-9.5 rounded-inputs border-dove bg-white text-[14px] w-37.5 focus-visible:ring-ink/30"
                aria-label="结束日期"
              />
            </>
          )}

          <button
            type="button"
            className="text-[14px] font-medium text-ink px-0.5 hover:opacity-60 transition-opacity"
            onClick={handleRefresh}
          >
            刷新
          </button>
        </div>
      </div>

      {/* 数据区：漏斗为 null 时显示空态，否则渲染漏斗主卡 + 员工维度表 */}
      {funnel === null ? (
        <div className="bg-white rounded-cards shadow-steep p-12 text-center text-[14px] text-slate">
          暂无漏斗数据
        </div>
      ) : (
        <>
          <FunnelStats
            data={funnel}
            rangeLabel={rangeLabel}
            dateRange={dateRange}
          />
          <FunnelEmployees rows={employeeRows} />
        </>
      )}
    </div>
  );
}
