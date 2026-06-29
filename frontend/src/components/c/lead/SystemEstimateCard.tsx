"use client";

import { Calculator } from "lucide-react";
import { cLocale } from "@/lib/i18n/c-locale";

interface SystemEstimateCardProps {
  evalPrice: number | null;
  statusColor: string;
  createdAt: string;
}

export function SystemEstimateCard({ evalPrice, statusColor, createdAt }: SystemEstimateCardProps) {
  return (
    <div
      className="rounded-cards bg-apricot-wash p-6 border-l border-dove/30"
      style={{ borderLeftColor: statusColor }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="h-5 w-5 text-rust" />
        <span className="text-sm font-medium text-ash">{cLocale.leads.systemEstimate.title}</span>
        <span className="ml-auto text-xs text-ash">{createdAt}</span>
      </div>

      {evalPrice !== null ? (
        <div>
          <span className="text-sm text-ash">{cLocale.leads.systemEstimate.priceLabel}</span>
          <span className="text-2xl font-medium text-rust">{evalPrice}</span>
          <span className="text-sm text-rust ml-1">{cLocale.leads.systemEstimate.unit}</span>
        </div>
      ) : (
        <p className="text-sm text-ash">{cLocale.leads.systemEstimate.pending}</p>
      )}
    </div>
  );
}
