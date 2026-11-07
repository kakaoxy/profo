"use client";

import { differenceInDays, isValid, parseISO } from "date-fns";
import { ArrowUpRight } from "lucide-react";

import { Project } from "../../../../types";

interface SellingPricingCardProps {
  project: Project;
  onEdit?: () => void;
}

function wan(value: number | undefined): number {
  return Number(value ?? 0) || 0;
}

function showWan(value: number): string {
  return value.toFixed(1);
}

export function SellingPricingCard({ project, onEdit }: SellingPricingCardProps) {
  const signingPrice = wan(project.signing_price);
  const listPrice = wan(project.list_price) || signingPrice;
  const area = wan(project.area);
  const estimatedCost = signingPrice + area * 0.36 + 6;
  const estimatedNetProfit = listPrice * 0.965 - estimatedCost;
  const estimatedRoi = estimatedCost > 0 ? Math.round((estimatedNetProfit / estimatedCost) * 100) : 0;
  const priceDiff = listPrice - signingPrice;
  const priceDiffPercent = signingPrice > 0 ? (priceDiff / signingPrice) * 100 : 0;
  const listedDays = (() => {
    if (project.days_on_market != null) return project.days_on_market;
    if (!project.listing_date) return 0;
    const date = parseISO(project.listing_date);
    return isValid(date) ? Math.max(0, differenceInDays(new Date(), date)) : 0;
  })();
  const holdingCost = Math.max(estimatedCost - signingPrice, 0);
  const taxAndChannel = listPrice * 0.035;
  const total = Math.max(signingPrice + holdingCost + Math.max(estimatedNetProfit, 0) + taxAndChannel, 1);
  const segments = [
    { label: "签约成本", value: signingPrice, className: "bg-ink" },
    { label: "装修与持有", value: holdingCost, className: "bg-apricot-wash" },
    { label: "预计净收益", value: Math.max(estimatedNetProfit, 0), className: "bg-rust" },
    { label: "税费及渠道", value: taxAndChannel, className: "bg-fog" },
  ];

  return (
    <section
      id="project-section-selling-pricing"
      className="mb-5 scroll-mt-28 rounded-cards bg-pure-white p-6 shadow-steep md:p-7"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-[500] text-ink">交易与定价</h2>
          <p className="mt-1 text-[13px] font-[430] text-graphite">从签约到挂牌的价格构成与收益预估</p>
        </div>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex shrink-0 items-center gap-1 text-[13px] font-[450] text-graphite transition-colors hover:text-ink"
          >
            调整价格
            <ArrowUpRight className="size-3.5" />
          </button>
        )}
      </div>

      <div className="mt-6 flex flex-wrap items-end justify-between gap-6 border-b border-[#f0f0f2] pb-6">
        <div>
          <span className="text-[12px] font-[430] text-graphite">当前挂牌价</span>
          <div className="mt-1.5 font-signifier text-[44px] font-[420] leading-none tracking-[-0.03em] text-ink">
            ¥{showWan(listPrice)}
            <small className="ml-1 font-sohne text-[18px] font-[430] tracking-normal text-graphite">万</small>
          </div>
          <p className="mt-2 text-[12.5px] font-[430] text-graphite">
            {listPrice > 0 && signingPrice > 0 ? (
              <>
                较签约价 {priceDiff >= 0 ? "+" : "-"}¥{showWan(Math.abs(priceDiff))} 万 · 涨幅{" "}
                {Math.abs(priceDiffPercent).toFixed(1)}%
              </>
            ) : (
              "待录入挂牌价"
            )}
          </p>
        </div>
        <div className="flex min-w-[230px] flex-1 justify-end gap-7">
          <div className="text-right">
            <span className="text-[12px] font-[430] text-graphite">预估净收益</span>
            <b className={estimatedNetProfit >= 0 ? "mt-1 block text-[15px] font-[480] text-rust" : "mt-1 block text-[15px] font-[480] text-ink"}>
              {estimatedNetProfit >= 0 ? "+" : "-"}¥{showWan(Math.abs(estimatedNetProfit))} 万
            </b>
          </div>
          <div className="text-right">
            <span className="text-[12px] font-[430] text-graphite">预估 ROI</span>
            <b className="mt-1 block text-[15px] font-[480] text-ink">{estimatedRoi}%</b>
          </div>
          <div className="text-right">
            <span className="text-[12px] font-[430] text-graphite">已挂牌</span>
            <b className="mt-1 block text-[15px] font-[480] text-ink">{listedDays} 天</b>
          </div>
        </div>
      </div>

      <div className="mt-5 flex h-2.5 overflow-hidden rounded-full bg-fog">
        {segments.map((segment) => (
          <span
            key={segment.label}
            className={segment.className}
            style={{ width: `${Math.max((segment.value / total) * 100, 2)}%` }}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {segments.map((segment) => (
          <span key={segment.label} className="inline-flex items-center gap-1.5 text-[11px] font-[430] text-graphite">
            <i className={`size-2 rounded-full ${segment.className}`} />
            {segment.label} <b className="font-[480] text-ink">¥{showWan(segment.value)} 万</b>
          </span>
        ))}
      </div>
    </section>
  );
}
