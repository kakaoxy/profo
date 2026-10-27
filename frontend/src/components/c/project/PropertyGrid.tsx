"use client";

interface PropertyGridProps {
  totalPrice: number;
  /** 真实成交价（万元，仅已售房源有值，广告法自查 P0-02）；null=未售或无成交记录 */
  soldPrice?: number | null;
  unitPrice: number;
  orientation: string;
  floorInfo: string;
  decorationStyle: string | null;
  layout: string;
  area: number;
}

export function PropertyGrid({
  totalPrice,
  soldPrice,
  unitPrice,
  orientation,
  floorInfo,
  decorationStyle,
  layout,
  area,
}: PropertyGridProps) {
  // 广告法自查 P0-02：仅在有真实成交价时标「成交价」；否则按挂牌价口径标注
  const cells = [
    {
      label: soldPrice != null ? "成交价" : "挂牌价",
      value: `${soldPrice ?? totalPrice}万`,
      isPrice: true,
    },
    // 广告法自查 P0-08：后端 unit_price 单位为万元/㎡，渲染为「X万/㎡」而非「X元/㎡」
    { label: "单价", value: `${unitPrice}万/㎡`, isPrice: true },
    { label: "户型", value: layout, isPrice: false },
    // 广告法自查 P0-04：面积需标明建筑面积口径（《房地产广告发布规定》第四条）
    { label: "建筑面积", value: `${area}㎡`, isPrice: false },
    { label: "朝向", value: orientation, isPrice: false },
    { label: "楼层", value: floorInfo, isPrice: false },
    ...(decorationStyle ? [{ label: "装修", value: decorationStyle, isPrice: false }] : []),
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {cells.map((cell) => (
        <div key={cell.label} className="bg-white p-5 rounded-cards shadow-steep-sm">
          <p className="text-[14px] text-graphite leading-caption tracking-caption">{cell.label}</p>
          <p
            className={`mt-1 font-medium text-ink min-w-0 truncate tabular-nums ${
              cell.isPrice ? "text-[18px]" : "text-[16px]"
            }`}
          >
            {cell.value}
          </p>
        </div>
      ))}
    </div>
  );
}
