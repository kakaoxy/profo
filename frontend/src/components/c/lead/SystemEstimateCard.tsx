"use client";

import { Calculator } from "lucide-react";
import { cLocale } from "@/lib/i18n/c-locale";

interface SystemEstimateCardProps {
  evalPrice: number | null;
  createdAt: string;
}

export function SystemEstimateCard({ evalPrice, createdAt }: SystemEstimateCardProps) {
  return (
    <div className="rounded-cards bg-apricot-wash p-6 border border-apricot-wash">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/60">
          <Calculator className="h-4 w-4 text-rust" aria-hidden="true" />
        </div>
        <span className="text-[15px] font-medium tracking-[-0.009em] text-ink">
          {cLocale.leads.systemEstimate.title}
        </span>
        <span className="ml-auto text-[12px] text-graphite">{createdAt}</span>
      </div>

      {evalPrice !== null ? (
        <div className="rounded-inputs bg-white/60 p-5">
          <span className="text-[14px] text-ash">{cLocale.leads.systemEstimate.priceLabel}</span>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-[44px] font-medium leading-[1.1] tracking-[-0.66px] text-ink">
              {evalPrice}
            </span>
            <span className="text-[15px] font-medium text-rust">
              {cLocale.leads.systemEstimate.unit}
            </span>
          </div>
        </div>
      ) : (
        <div className="rounded-inputs bg-white/60 p-5">
          <p className="text-[15px] text-ash">{cLocale.leads.systemEstimate.pending}</p>
        </div>
      )}
    </div>
  );
}
