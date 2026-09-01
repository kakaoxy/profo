"use client";

import { useQueryStates, parseAsString } from "nuqs";

import type {
  GrowthEmployeeDrilldownData,
  GrowthFunnelCompareData,
  GrowthFunnelData,
} from "../../_lib/funnel-data";
import type { FunnelTab } from "../../_lib/funnel-constants";
import { FUNNEL_DAYS_OPTIONS } from "../../_lib/funnel-constants";
import { GROWTH_MODULE_META } from "../../types";
import { PhaseTag1, PhaseTag2 } from "../../_components/phase-tag";
import { FunnelStats } from "./funnel-stats";
import { FunnelCompare } from "./funnel-compare";
import { FunnelDrilldown } from "./funnel-drilldown";

/** 模块 Tab 项（招募 / 估价 / 房源预约 / 房源单 / 全部对比） */
const MODULE_TABS: ReadonlyArray<{ value: FunnelTab; label: string }> = [
  { value: "recruit", label: GROWTH_MODULE_META.recruit.label },
  { value: "valuation", label: GROWTH_MODULE_META.valuation.label },
  { value: "booking", label: GROWTH_MODULE_META.booking.label },
  { value: "sheet", label: GROWTH_MODULE_META.sheet.label },
  { value: "compare", label: "全部对比" },
];

/** 模块 Tab 药丸按钮样式（对齐设计稿 .tab） */
function tabClass(active: boolean): string {
  return [
    "h-[38px] px-[18px] rounded-full border inline-flex items-center gap-1.5 whitespace-nowrap text-[14px] transition-colors",
    active
      ? "bg-ink border-ink text-white font-medium"
      : "bg-white border-[#ececee] text-graphite hover:border-dove",
  ].join(" ");
}

/** 时间区间分段按钮样式（对齐设计稿 .tab.seg） */
function segClass(active: boolean): string {
  return [
    "h-8 px-3.5 rounded-full border inline-flex items-center whitespace-nowrap text-[13px] transition-colors",
    active
      ? "bg-ink border-ink text-white font-medium"
      : "bg-white border-[#ececee] text-graphite hover:border-dove",
  ].join(" ");
}

export interface FunnelViewProps {
  /** 当前模块 Tab（recruit|valuation|booking|sheet|compare） */
  module: FunnelTab;
  /** 当前时间窗口（天） */
  days: number;
  /** 单模块漏斗数据（compare Tab 下为 null） */
  funnel: GrowthFunnelData | null;
  /** 四模块对比数据（仅 compare Tab 下非 null） */
  compare: GrowthFunnelCompareData | null;
  /** 员工维度下钻数据（compare Tab 下默认招募模块） */
  drilldown: GrowthEmployeeDrilldownData;
  /** 日期区间展示文本，如「2026-08-02 ~ 2026-09-01」 */
  dateRange: string;
}

/**
 * 跨模块漏斗看板视图（对齐设计稿 Screen 3）：
 * 页头（一期标记 + 时间区间快捷选择 + 二期导出占位）→ 模块 Tab（URL 参数驱动）→
 * 单模块漏斗卡 / 全部对比卡 → 员工维度下钻表 → 口径脚注。
 */
export function FunnelView({
  module,
  days,
  funnel,
  compare,
  drilldown,
  dateRange,
}: FunnelViewProps) {
  // URL 状态（nuqs 管理，shallow:false → 触发服务端重新取数）
  const [, setQuery] = useQueryStates(
    {
      module: parseAsString.withDefault("recruit"),
      days: parseAsString.withDefault("30"),
    },
    { shallow: false },
  );

  return (
    <div className="flex flex-col gap-6">
      {/* 页头：标题 + 一期标记 + 时间区间 + 导出（二期占位） */}
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
        <div>
          <h1 className="text-[26px] font-medium tracking-[-0.23px] text-ink inline-flex items-center gap-2.5">
            漏斗看板
            <PhaseTag1 />
          </h1>
          <p className="mt-1.5 text-[15px] text-graphite">
            分享 → 打开 → 留资 → 转化的全链路转化监控
          </p>
        </div>
        <div className="flex flex-col items-start xl:items-end gap-2.5">
          <div className="flex flex-wrap gap-2" role="group" aria-label="时间区间">
            {FUNNEL_DAYS_OPTIONS.map((d) => (
              <button
                key={d}
                type="button"
                className={segClass(days === d)}
                onClick={() => setQuery({ days: String(d) })}
              >
                近 {d} 天
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1.5 h-9 px-5 rounded-full bg-ink text-white text-[14px] font-medium opacity-50 cursor-not-allowed"
            aria-disabled="true"
          >
            导出漏斗数据
            <PhaseTag2 />
          </button>
        </div>
      </div>

      {/* 模块 Tab（URL 参数 module 驱动） */}
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="漏斗模块">
        {MODULE_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={module === tab.value}
            className={tabClass(module === tab.value)}
            onClick={() => setQuery({ module: tab.value })}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 数据区：单模块漏斗卡 / 全部对比卡 */}
      {module === "compare" ? (
        compare ? (
          <FunnelCompare data={compare} />
        ) : null
      ) : funnel ? (
        <FunnelStats data={funnel} dateRange={dateRange} />
      ) : null}

      {/* 员工维度下钻（compare Tab 下默认招募模块，与设计稿一致） */}
      <FunnelDrilldown data={drilldown} />

      {/* 口径脚注（对齐设计稿 Screen 3 footer） */}
      <footer className="text-[12px] text-slate leading-[1.9] pt-1">
        ① 招募 UV 为登录态 openid_hash（需登录），其余模块为匿名 visitor_id，UV
        不可跨模块横向对比；② 打开 PV 含非分享自然流量（扫码 / 搜索 / 直接访问），打开率可 ＞100%；③
        有效新客已排除内部员工标记；房源单转化承接复用估价留资链路（referrer 续传）
      </footer>
    </div>
  );
}
