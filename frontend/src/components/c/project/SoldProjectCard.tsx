"use client";

import { Timer } from "lucide-react";

interface SoldProjectCardProps {
  id: number;
  communityName: string | null;
  layout: string;
  area: number;
  /** 真实成交价（万元，ProjectSale.sold_price）；无销售记录或未录成交价为 null */
  soldPrice: number | null;
  title: string;
  coverImage: string | null;
  /** 成交天数（sold_date - listing_date）；任一日期缺失为 null，不渲染周期 chip */
  soldDays: number | null;
  decorationStyle: string | null;
}

/**
 * 已售案例卡（广告法自查 P0-02/P0-03/P0-04 整改版）.
 *
 * - 价格：仅在有真实成交价（sold_price）时展示「成交价 X 万」；
 *   无成交价显示「价格面议」，不得回退展示营销表挂牌价冒充成交价。
 * - 周期：仅在后端给出 sold_days（真实口径）时渲染，避免「0天成交」失实渲染。
 * - 面积：标注「建筑面积」口径（《房地产广告发布规定》第四条强制要求）。
 */
export function SoldProjectCard({
  communityName,
  layout,
  area,
  soldPrice,
  soldDays,
}: SoldProjectCardProps) {
  return (
    <div className="rounded-cards bg-white p-6 shadow-steep">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-c-status-sold/10 px-2.5 py-0.5 text-xs font-medium text-c-status-sold">
            已售
          </span>
          <h3 className="text-xl font-medium text-ink">{communityName ?? "未知小区"}</h3>
        </div>
        <div className="flex items-baseline gap-0.5 shrink-0">
          {soldPrice !== null ? (
            <>
              <span className="text-2xl font-medium text-ink">{soldPrice}</span>
              <span className="text-sm text-ink">万</span>
            </>
          ) : (
            <span className="text-sm text-ink">价格面议</span>
          )}
        </div>
      </div>

      <p className="mt-2 text-sm text-graphite">
        建筑面积 {area}㎡ · {layout}
      </p>

      <div className="mt-4 flex items-center gap-2 border-t border-dove/30 pt-4">
        {soldDays !== null && soldDays > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-apricot-wash px-2.5 py-0.5 text-xs font-medium text-rust">
            <Timer className="h-3 w-3" />
            {soldDays}天成交
          </span>
        )}
        {soldPrice !== null && (
          <span className="text-xs text-graphite">成交价 · 公司垫资装修</span>
        )}
      </div>
    </div>
  );
}
