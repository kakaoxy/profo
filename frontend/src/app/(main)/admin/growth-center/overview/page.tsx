import {
  getGrowthEmployeeTop,
  getGrowthFunnelCompare,
  getGrowthOverviewKpi,
  getGrowthSourceBreakdown,
  getGrowthTrend,
} from "../_lib/growth-data";
import { OverviewView } from "./_components/overview-view";

/**
 * 获客总览页（获客中心 · 对齐设计稿 Screen 1）。
 *
 * Server Component：并行获取 KPI、来源构成、逐日趋势、四模块漏斗对比、
 * 员工 TOP 榜（统一近 30 天口径），任一失败由 error 边界兜底。
 */
export default async function GrowthOverviewPage() {
  const [kpi, breakdown, trend, compare, top] = await Promise.all([
    getGrowthOverviewKpi(),
    getGrowthSourceBreakdown(30),
    getGrowthTrend(30),
    getGrowthFunnelCompare(30),
    getGrowthEmployeeTop(30, 5),
  ]);

  return (
    <div className="min-h-screen bg-fog">
      <div className="w-full max-w-300 mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <OverviewView kpi={kpi} breakdown={breakdown} trend={trend} compare={compare} top={top} />
      </div>
    </div>
  );
}
