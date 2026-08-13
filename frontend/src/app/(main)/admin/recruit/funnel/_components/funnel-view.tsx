"use client";

import { useEffect, useRef, useState } from "react";
import { format, subDays } from "date-fns";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import { fetchMockFunnel } from "../../_lib/mock-recruit";
import type {
  RecruitCampaign,
  RecruitEmployee,
  RecruitFunnelData,
} from "../../types";
import { FunnelStats } from "./funnel-stats";
import { FunnelEmployees, type EmployeeFunnelRow } from "./funnel-employees";

// TODO(二期): 替换为真实接口
// GET /api/v1/admin/recruit/leads/funnel?start_date=&end_date=&campaign_id=&employee_id=

interface FunnelViewProps {
  /** 员工维度选项（全部 + 各员工），来自 mock，二期替换为接口返回 */
  employees: RecruitEmployee[];
  /** 活动维度选项（全部 + 各活动），来自 mock，二期替换为接口返回 */
  campaigns: RecruitCampaign[];
}

/** Select 中「全部」的占位值（Radix Select 不允许空字符串 value，故用 "all"） */
const ALL = "all";

/** 时间区间快捷选项 */
const RANGE_OPTIONS = [
  { value: "7", label: "近 7 天" },
  { value: "30", label: "近 30 天" },
  { value: "90", label: "近 90 天" },
  { value: "custom", label: "自定义区间" },
] as const;

type RangeValue = (typeof RANGE_OPTIONS)[number]["value"];

/** 将 Date 格式化为 YYYY-MM-DD */
function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/**
 * 漏斗看板（对齐设计稿 F3）：
 * 页头右侧查询条件（活动 / 员工 / 时间区间 / 刷新），
 * 数据区为转化漏斗主卡 + 员工维度拉新贡献表；
 * 查询条件变化时自动重新拉取漏斗数据（含员工维度并行下钻）。
 */
export function FunnelView({ employees, campaigns }: FunnelViewProps) {
  const [campaignId, setCampaignId] = useState<string>(ALL);
  const [employeeId, setEmployeeId] = useState<string>(ALL);
  const [range, setRange] = useState<RangeValue>("30");
  // 自定义区间的起止日期（仅 range === "custom" 时生效）
  const [customStart, setCustomStart] = useState<string>(() =>
    toDateStr(subDays(new Date(), 29)),
  );
  const [customEnd, setCustomEnd] = useState<string>(() => toDateStr(new Date()));
  const [refreshKey, setRefreshKey] = useState(0);

  const [funnel, setFunnel] = useState<RecruitFunnelData | null>(null);
  const [employeeRows, setEmployeeRows] = useState<EmployeeFunnelRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  // 记录上一次区间是否非法，避免无效输入期间重复 toast
  const invalidRangeRef = useRef<boolean>(false);

  const rangeLabel = range === "custom" ? "自定义区间" : `近 ${range} 天`;

  // 生效日期区间：快捷区间由今天往前推 N-1 天，自定义区间直接取输入值
  const { startDate, endDate } =
    range === "custom"
      ? { startDate: customStart, endDate: customEnd }
      : {
          startDate: toDateStr(subDays(new Date(), Number(range) - 1)),
          endDate: toDateStr(new Date()),
        };

  useEffect(() => {
    // 区间校验：开始日期晚于结束日期时提示并阻止查询
    if (startDate && endDate && startDate > endDate) {
      if (!invalidRangeRef.current) {
        toast.error("开始日期不能晚于结束日期");
      }
      invalidRangeRef.current = true;
      return;
    }
    invalidRangeRef.current = false;

    let cancelled = false;
    setLoading(true);
    const queryBase = {
      start_date: startDate,
      end_date: endDate,
      campaign_id: campaignId === ALL ? null : campaignId,
    };
    // 并行拉取整体漏斗 + 各员工漏斗（员工维度下钻数据）
    Promise.all([
      fetchMockFunnel({
        ...queryBase,
        employee_id: employeeId === ALL ? null : employeeId,
      }),
      ...employees.map((emp) =>
        fetchMockFunnel({ ...queryBase, employee_id: emp.id }),
      ),
    ]).then(([overall, ...perEmp]) => {
      if (cancelled) return;
      setFunnel(overall);
      setEmployeeRows(
        employees.map((emp, i) => ({ employee: emp, data: perEmp[i] })),
      );
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [startDate, endDate, campaignId, employeeId, refreshKey, employees]);

  // 员工维度表展示行：指定员工时仅展示该员工
  const displayedRows =
    employeeId === ALL
      ? employeeRows
      : employeeRows.filter((r) => r.employee.id === employeeId);

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
          <Select value={campaignId} onValueChange={setCampaignId}>
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

          <Select value={employeeId} onValueChange={setEmployeeId}>
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
            onValueChange={(val) => setRange(val as RangeValue)}
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
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-9.5 rounded-inputs border-dove bg-white text-[14px] w-37.5 focus-visible:ring-ink/30"
                aria-label="开始日期"
              />
              <span className="text-[13px] text-slate">至</span>
              <Input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-9.5 rounded-inputs border-dove bg-white text-[14px] w-37.5 focus-visible:ring-ink/30"
                aria-label="结束日期"
              />
            </>
          )}

          <button
            type="button"
            className="text-[14px] font-medium text-ink px-0.5 hover:opacity-60 transition-opacity"
            onClick={() => {
              setRefreshKey((k) => k + 1);
              toast.success("漏斗数据已刷新");
            }}
          >
            刷新
          </button>
        </div>
      </div>

      {/* 数据区：加载中显示骨架，加载完成渲染漏斗主卡 + 员工维度表 */}
      {loading || funnel === null ? (
        <div
          className="flex flex-col gap-6"
          aria-busy="true"
          aria-label="漏斗数据加载中"
        >
          <div className="bg-white rounded-cards shadow-steep p-6">
            <Skeleton className="h-5 w-48 mb-4" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10.5 rounded-[14px] mb-3" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-cards" />
        </div>
      ) : (
        <>
          <FunnelStats
            data={funnel}
            rangeLabel={rangeLabel}
            dateRange={`${startDate} ~ ${endDate}`}
          />
          <FunnelEmployees rows={displayedRows} />
        </>
      )}
    </div>
  );
}
