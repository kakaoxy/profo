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
    <div className="rounded-cards bg-white p-6 shadow-steep">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-c-status-sold/10 px-2.5 py-0.5 text-xs font-medium text-c-status-sold">
            已售
          </span>
          <h3 className="text-xl font-medium text-ink">
            {communityName ?? "未知小区"}
          </h3>
        </div>
        <div className="flex items-baseline gap-0.5 shrink-0">
          <span className="text-2xl font-medium text-ink">
            {totalPrice}
          </span>
          <span className="text-sm text-ink">万</span>
        </div>
      </div>

      <p className="mt-2 text-sm text-graphite">
        {area}㎡ · {layout}
      </p>

      <div className="mt-4 flex items-center gap-2 border-t border-dove/30 pt-4">
        {soldDays !== null && (
          <>
            <span className="inline-flex items-center gap-1 rounded-full bg-apricot-wash px-2.5 py-0.5 text-xs font-medium text-rust">
              <Timer className="h-3 w-3" />
              {soldDays}天成交
            </span>
          </>
        )}
        <span className="text-xs text-graphite">
          公司垫资装修 · 全权卖房
        </span>
      </div>
    </div>
  );
}
