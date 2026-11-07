import { ArrowUpRight, CircleDot } from "lucide-react";

interface MarketingStatsProps {
  stats: {
    total?: number;
    published?: number;
    draft?: number;
    for_sale?: number;
    sold?: number;
    in_progress?: number;
    total_views?: number;
  };
}

interface DeskMetricProps {
  label: string;
  value: number;
  note: string;
  warm?: boolean;
  unit?: string;
}

function DeskMetric({ label, value, note, warm = false, unit = "套" }: DeskMetricProps) {
  return (
    <div className="flex min-w-0 flex-col justify-between px-5 py-1 first:pl-0 last:pr-0">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-graphite">
        <span className={`h-1.5 w-1.5 rounded-full ${warm ? "bg-rust" : "bg-ink/30"}`} />
        {label}
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span
          className={`font-display text-[40px] leading-none tracking-[-0.03em] ${
            warm ? "text-rust" : "text-ink"
          } tabular-nums`}
        >
          {value.toLocaleString()}
        </span>
        <span className="text-[11px] text-graphite">{unit}</span>
      </div>
      <div className="mt-2 text-[11px] text-graphite">{note}</div>
    </div>
  );
}

/**
 * 营销项目概览卡：把运营总览做成一张“房源营销台”抬头，
 * 大数字是在管房源总量，右侧为四个状态/触达指标。
 */
export function MarketingStats({ stats }: MarketingStatsProps) {
  const total = stats.total ?? 0;
  const published = stats.published ?? 0;
  const draft = stats.draft ?? 0;
  const forSale = stats.for_sale ?? 0;
  const totalViews = stats.total_views ?? 0;
  const publishedRate = total > 0 ? Math.round((published / total) * 100) : 0;

  return (
    <section className="overflow-hidden rounded-cards bg-white shadow-steep-sm">
      <div className="grid gap-6 p-6 lg:grid-cols-[minmax(250px,0.9fr)_minmax(0,2.2fr)] lg:items-stretch lg:gap-0">
        <div className="flex flex-col justify-between border-b border-dove/30 pb-5 lg:border-r lg:border-b-0 lg:pb-0 lg:pr-8">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.1em] text-graphite">
              <CircleDot className="h-3.5 w-3.5 text-rust" />
              在管房源
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-display text-[64px] leading-none tracking-[-0.035em] text-ink tabular-nums">
                {total.toLocaleString()}
              </span>
              <span className="pb-1 text-sm text-graphite">套</span>
            </div>
            <p className="mt-3 max-w-[240px] text-[13px] leading-relaxed text-graphite">
              营销项目总览。发布、价格与浏览数据在这里汇合，方便快速找到下一步要处理的房源。
            </p>
          </div>
          <div className="mt-5 flex items-center gap-2 text-[11px] text-graphite lg:mt-0">
            <span className="h-1.5 w-1.5 rounded-full bg-success" />
            数据已同步
            <span className="text-dove">·</span>
            <span>房源信息实时回写</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-y-6 lg:grid-cols-4 lg:divide-x lg:divide-dove/30 lg:pl-3">
          <DeskMetric label="已发布" value={published} note="客户端可见" warm />
          <DeskMetric label="草稿" value={draft} note="待完善后发布" />
          <DeskMetric label="在售" value={forSale} note="正在交易中" />
          <DeskMetric
            label="累计浏览"
            value={totalViews}
            unit="次"
            note="客户端详情页 PV"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-dove/30 bg-fog/60 px-6 py-3 text-[11px] text-graphite">
        <span className="inline-flex items-center gap-1.5">
          <ArrowUpRight className="h-3.5 w-3.5 text-rust" />
          运营信号
        </span>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span>
            已发布占比 <b className="font-medium text-ash">{publishedRate}%</b>
          </span>
          <span>
            草稿待完善 <b className="font-medium text-ash">{draft}</b> 套
          </span>
          <span>
            在售可浏览 <b className="font-medium text-ash">{forSale}</b> 套
          </span>
        </div>
      </div>
    </section>
  );
}
