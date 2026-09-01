import { format, subDays } from "date-fns";

import {
  getGrowthEmployeeDrilldown,
  getGrowthFunnel,
  getGrowthFunnelCompare,
  parseFunnelDays,
  parseFunnelTab,
} from "../_lib/funnel-data";
import { FunnelView } from "./_components/funnel-view";

/** 将 Date 格式化为 YYYY-MM-DD */
function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

interface GrowthFunnelPageProps {
  searchParams: Promise<{ module?: string; days?: string }>;
}

/**
 * 跨模块漏斗看板页（对齐设计稿 Screen 3）。
 * URL 参数驱动：module=recruit|valuation|booking|sheet|compare，days=7|30|90；
 * 筛选变化由客户端 nuqs 更新 URL 触发本 Server Component 重新取数。
 */
export default async function GrowthFunnelPage({ searchParams }: GrowthFunnelPageProps) {
  const { module: moduleRaw, days: daysRaw } = await searchParams;
  const tab = parseFunnelTab(moduleRaw);
  const days = parseFunnelDays(daysRaw);

  // 全部对比 Tab 下员工下钻表默认展示招募模块；单模块 Tab 与上方漏斗同口径
  const drilldownModule = tab === "compare" ? "recruit" : tab;

  const [funnel, compare, drilldown] = await Promise.all([
    tab === "compare" ? null : getGrowthFunnel(tab, days),
    tab === "compare" ? getGrowthFunnelCompare(days) : null,
    getGrowthEmployeeDrilldown(drilldownModule, days),
  ]);

  const today = new Date();
  const dateRange = `${toDateStr(subDays(today, days - 1))} ~ ${toDateStr(today)}`;

  return (
    <div className="min-h-screen bg-fog">
      <div className="w-full max-w-300 mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <FunnelView
          module={tab}
          days={days}
          funnel={funnel}
          compare={compare}
          drilldown={drilldown}
          dateRange={dateRange}
        />
      </div>
    </div>
  );
}
