"use client";

interface PropertyGridProps {
  totalPrice: number;
  unitPrice: number;
  orientation: string;
  floorInfo: string;
  decorationStyle: string | null;
  layout: string;
  area: number;
}

export function PropertyGrid({
  totalPrice,
  unitPrice,
  orientation,
  floorInfo,
  decorationStyle,
  layout,
  area,
}: PropertyGridProps) {
  const cells = [
    { label: "总价", value: `${totalPrice}万`, isPrice: true },
    { label: "单价", value: `${unitPrice}元/㎡`, isPrice: true },
    { label: "户型", value: layout, isPrice: false },
    { label: "面积", value: `${area}㎡`, isPrice: false },
    { label: "朝向", value: orientation, isPrice: false },
    { label: "楼层", value: floorInfo, isPrice: false },
    ...(decorationStyle
      ? [{ label: "装修", value: decorationStyle, isPrice: false }]
      : []),
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className="bg-white p-5 rounded-cards shadow-steep-sm"
        >
          <p className="text-sm text-graphite">{cell.label}</p>
          <p
            className={`font-medium text-ink ${
              cell.isPrice ? "text-lg" : "text-base"
            }`}
          >
            {cell.value}
          </p>
        </div>
      ))}
    </div>
  );
}
