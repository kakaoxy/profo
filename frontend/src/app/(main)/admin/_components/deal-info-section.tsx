"use client";

import { Wallet, CalendarDays, Timer } from "lucide-react";
import { toNumber } from "@/lib/number-utils";
import { formatCnyWan } from "@/lib/formatters";

interface DealInfoSectionProps {
  /** 成交价(万) - 后端 Decimal 序列化为字符串 */
  soldPrice?: string | number | null;
  /** 成交日期 YYYY-MM-DD */
  soldDate?: string | null;
  /** 交易状态原值（如 completed/pending），暂无中文映射 */
  transactionStatus?: string | null;
  /** 成交用时(天) = sold_date - listing_date */
  daysOnMarket?: number | null;
  /** 面积(㎡) - 用于计算成交单价，后端返回字符串 */
  area?: string | number | null;
}

/**
 * 监控项目卡片「成交信息」区块。
 * 仅在父组件判定项目已售或存在 sold_price 时渲染。
 * 视觉风格对齐 MarketDataSection 的 2 列网格布局。
 */
export function DealInfoSection({
  soldPrice,
  soldDate,
  transactionStatus,
  daysOnMarket,
  area,
}: DealInfoSectionProps) {
  const soldPriceNum = toNumber(soldPrice);
  const areaNum = toNumber(area);
  // 成交单价(元/㎡) = 成交价(万) * 10000 / 面积(㎡)
  // 参考 sold/header-section.tsx:32-35 的计算逻辑
  const unitPrice =
    soldPriceNum != null && areaNum && areaNum > 0
      ? Math.round((soldPriceNum * 10000) / areaNum)
      : null;

  return (
    <div className="space-y-3 min-h-[80px]">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Wallet className="w-3 h-3" aria-hidden="true" />
            成交价
          </p>
          <p className="text-sm font-bold tabular-nums">
            {soldPriceNum != null ? formatCnyWan(soldPriceNum) : "-"}
          </p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Wallet className="w-3 h-3" aria-hidden="true" />
            成交单价
          </p>
          <p className="text-sm font-bold tabular-nums">
            {unitPrice != null
              ? `¥${unitPrice.toLocaleString()}/m²`
              : "-"}
          </p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <CalendarDays className="w-3 h-3" aria-hidden="true" />
            成交日期
          </p>
          <p className="text-sm font-bold tabular-nums">
            {soldDate || "-"}
          </p>
        </div>
        <div className="space-y-0.5">
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Timer className="w-3 h-3" aria-hidden="true" />
            成交用时
          </p>
          <p className="text-sm font-bold tabular-nums">
            {daysOnMarket != null ? `${daysOnMarket} 天` : "-"}
          </p>
        </div>
      </div>
      {transactionStatus && (
        <p className="text-[10px] text-muted-foreground">
          交易状态: <span className="font-medium">{transactionStatus}</span>
        </p>
      )}
    </div>
  );
}
