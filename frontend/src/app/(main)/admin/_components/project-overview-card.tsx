import { WidgetHead } from "./widgets/widget-head";
import { WgKpi } from "./widgets/wg-kpi";

interface ProjectOverviewCardProps {
  signingCount: number;
  renovatingCount: number;
  sellingCount: number;
  soldCount: number;
}

/**
 * 工作台「项目总览」卡（span 3，设计稿屏 01 第 1 卡）。
 *
 * hifi `.wg` + `.kpi-2`：卡头「详情」+ 2×2 指标（数值统一 Ink，逐项不加配色）。
 * 栅格宽度由外层 widget 容器（注册表 span=3）决定，本组件不再自带 col-span-*。
 */
export function ProjectOverviewCard({
  signingCount,
  renovatingCount,
  sellingCount,
  soldCount,
}: ProjectOverviewCardProps) {
  return (
    <div
      className="flex min-w-0 flex-1 flex-col rounded-cards bg-white px-[22px] py-5 shadow-steep-sm"
      role="region"
      aria-label="项目总览"
    >
      <WidgetHead title="项目总览" link="详情" href="/admin/projects" />

      <div className="mt-[18px] grid grid-cols-2 gap-x-3.5 gap-y-4">
        <WgKpi label="已签约" value={signingCount} />
        <WgKpi label="装修中" value={renovatingCount} />
        <WgKpi label="在售中" value={sellingCount} />
        <WgKpi label="已成交" value={soldCount} />
      </div>
    </div>
  );
}
