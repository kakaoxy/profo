"use client";

import { Calculator } from "lucide-react";

interface SystemEstimateCardProps {
  evalPrice: number | null;
  statusColor: string;
  createdAt: string;
}

export function SystemEstimateCard({ evalPrice, statusColor, createdAt }: SystemEstimateCardProps) {
  return (
    <div
      className="rounded-xl bg-white p-6 shadow-[0px_4px_20px_rgba(15,23,42,0.05)] border border-c-border-subtle border-l-4"
      style={{ borderLeftColor: statusColor }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Calculator className="h-5 w-5 text-c-text-secondary" />
        <span className="text-sm font-medium text-c-text-secondary">系统估价</span>
        <span className="ml-auto text-xs text-c-text-secondary">{createdAt}</span>
      </div>

      {evalPrice !== null ? (
        <div>
          <span className="text-sm text-c-text-secondary">评估价格：</span>
          <span className="text-2xl font-bold text-c-trust-blue">{evalPrice}</span>
          <span className="text-sm text-c-trust-blue ml-1">万</span>
        </div>
      ) : (
        <p className="text-sm text-c-text-secondary">估价进行中，请耐心等待...</p>
      )}
    </div>
  );
}
