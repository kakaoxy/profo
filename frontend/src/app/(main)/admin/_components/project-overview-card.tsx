import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface ProjectOverviewCardProps {
  signingCount: number;
  renovatingCount: number;
  sellingCount: number;
  soldCount: number;
}

const OVERVIEW_ITEMS = [
  { key: "signing", label: "已签约" },
  { key: "renovating", label: "装修中" },
  { key: "selling", label: "在售中" },
  { key: "sold", label: "已成交" },
] as const;

/** 工作台「项目总览」卡（Steep：卡头 15px + 2×2 指标栅格，数值统一 Ink，设计稿决策 05） */
export function ProjectOverviewCard({
  signingCount,
  renovatingCount,
  sellingCount,
  soldCount,
}: ProjectOverviewCardProps) {
  const values: Record<(typeof OVERVIEW_ITEMS)[number]["key"], number> = {
    signing: signingCount,
    renovating: renovatingCount,
    selling: sellingCount,
    sold: soldCount,
  };

  return (
    <div
      className="col-span-12 lg:col-span-5 bg-white rounded-cards shadow-steep-sm px-6 py-[22px] flex flex-col min-w-0"
      role="region"
      aria-label="项目总览"
    >
      <div className="flex items-center justify-between">
        <span className="text-[15px] font-medium text-ink">项目总览</span>
        <Link
          href="/admin/projects"
          className="inline-flex items-center gap-1 text-sm font-[450] text-ink hover:text-rust transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
        >
          详情
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div className="flex-1 grid grid-cols-2 content-center gap-x-4 gap-y-[18px] mt-[18px]">
        {OVERVIEW_ITEMS.map((item) => (
          <div key={item.key} className="min-w-0">
            <div className="text-[12.5px] text-graphite">{item.label}</div>
            <div className="mt-[5px] text-[26px] font-[480] leading-none tabular-nums text-ink">
              {values[item.key]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
