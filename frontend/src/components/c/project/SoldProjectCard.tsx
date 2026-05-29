"use client";

import { Timer } from "lucide-react";

interface SoldProjectCardProps {
  id: number;
  communityName: string | null;
  layout: string;
  area: number;
  totalPrice: number;
  unitPrice: number;
  title: string;
  coverImage: string | null;
  soldDays: number | null;
  decorationStyle: string | null;
}

export function SoldProjectCard({
  communityName,
  layout,
  area,
  totalPrice,
  soldDays,
}: SoldProjectCardProps) {
  return (
    <div className="rounded-2xl border border-c-border-subtle bg-white p-6 shadow-[0px_4px_20px_rgba(15,23,42,0.05)]">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded-full border border-green-100 bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-600">
            已售
          </span>
          <h3 className="text-xl font-semibold text-c-trust-blue">
            {communityName ?? "未知小区"}
          </h3>
        </div>
        <div className="flex items-baseline gap-0.5 shrink-0">
          <span className="text-2xl font-bold text-c-trust-blue">
            {totalPrice}
          </span>
          <span className="text-sm text-c-trust-blue">万</span>
        </div>
      </div>

      <p className="mt-2 text-sm text-c-text-secondary">
        {area}㎡ · {layout}
      </p>

      <div className="mt-4 flex items-center gap-2 border-t border-c-border-subtle pt-4">
        {soldDays !== null && (
          <>
            <span className="inline-flex items-center gap-1 rounded-full bg-c-action-gold/10 px-2.5 py-0.5 text-xs font-medium text-c-action-gold">
              <Timer className="h-3 w-3" />
              {soldDays}天成交
            </span>
          </>
        )}
        <span className="text-xs text-c-text-secondary">
          专业定价 · 精准营销 · 快速成交
        </span>
      </div>
    </div>
  );
}
