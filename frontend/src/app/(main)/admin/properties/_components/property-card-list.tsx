"use client";

import { memo } from "react";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { useQueryState } from "nuqs";
import { Badge } from "@/components/ui/badge";
import { Property, getFloorPlan } from "../columns";
import { safeFormatDate } from "@/lib/formatters";

interface PropertyCardListProps {
  properties: Property[];
}

interface PropertyCardItemProps {
  property: Property;
}

// 单卡片组件：订阅 useQueryState(propertyId) 用于触发 Sheet，
// 用 memo 包裹避免因非 propertyId 原因（如父组件重渲染）触发全列表重渲染。
// 规则: rerender-memo
function PropertyCardItemImpl({ property }: PropertyCardItemProps) {
  const [, setPropertyId] = useQueryState("propertyId", { shallow: true });

  const cover = getFloorPlan(property.data_source, property.picture_links);
  const {
    community_name,
    status,
    rooms,
    baths,
    floor_display,
    build_area,
    total_price,
    unit_price,
  } = property;

  // 时间显示逻辑：成交用 sold_date，其他用 listed_date，与 columns.tsx time_display 列一致
  // 使用 safeFormatDate 防止 Invalid Date 传播；yy/MM/dd 含两位年份便于跨年识别
  const dateStr = status === "成交" ? property.sold_date : property.listed_date;
  const formattedDate = safeFormatDate(dateStr, "yy/MM/dd", "");

  return (
    <div
      className="rounded-lg border border-border bg-card p-3 cursor-pointer active:opacity-70 transition flex items-center gap-3"
      onClick={() => setPropertyId(String(property.id))}
    >
      {/* 左侧：户型图缩略图 */}
      <div className="w-16 h-12 rounded overflow-hidden bg-muted shrink-0 relative">
        {cover ? (
          <Image
            src={cover}
            alt="户型图缩略"
            fill
            sizes="(max-width: 768px) 64px, 0px"
            className="object-cover"
            unoptimized
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground">
            <ImageIcon className="h-4 w-4" />
          </div>
        )}
      </div>

      {/* 右侧竖向信息 */}
      <div className="flex-1 min-w-0 space-y-1">
        {/* 第一行：小区名 + 状态 Badge */}
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{community_name}</span>
          <Badge
            variant={
              status === "在售"
                ? "default"
                : status === "成交"
                  ? "secondary"
                  : status === "过期"
                    ? "destructive"
                    : "outline"
            }
            className="shrink-0 ml-auto"
          >
            {status}
          </Badge>
        </div>

        {/* 第二行：户型·楼层·面积 */}
        <div className="text-xs text-muted-foreground">
          {rooms}室{baths}卫 · {floor_display} · {build_area}㎡
        </div>

        {/* 第三行：价格 + 单价 */}
        <div className="flex items-baseline">
          <span className="text-error font-bold text-sm">{total_price}万</span>
          <span className="text-[10px] text-muted-foreground ml-2">{unit_price} 元/㎡</span>
        </div>

        {/* 第四行：时间 MM/DD */}
        {formattedDate && <div className="text-[10px] text-muted-foreground">{formattedDate}</div>}
      </div>
    </div>
  );
}

const PropertyCardItem = memo(PropertyCardItemImpl);

export function PropertyCardList({ properties }: PropertyCardListProps) {
  return (
    <div className="space-y-2">
      {properties.map((property) => (
        <PropertyCardItem key={property.id} property={property} />
      ))}
    </div>
  );
}
