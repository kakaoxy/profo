"use client";

import { formatArea } from "@/lib/formatters";

interface PropertyInfoProps {
  communityName?: string;
  layout?: string;
  area?: string | number;
  orientation?: string;
  floorInfo?: string;
  decorationStyle?: string;
  projectStatus?: string;
  updatedAt?: string;
}

export function PropertyInfo({
  communityName,
  layout,
  area,
  orientation,
  floorInfo,
  decorationStyle,
  projectStatus,
  updatedAt,
}: PropertyInfoProps) {
  const infoItems = [
    { label: "小区", value: communityName },
    { label: "户型", value: layout },
    { label: "面积", value: area ? formatArea(area) : undefined },
    { label: "朝向", value: orientation },
    { label: "楼层", value: floorInfo },
    { label: "装修风格", value: decorationStyle },
    { label: "项目状态", value: projectStatus },
    {
      label: "更新时间",
      value: updatedAt
        ? new Date(updatedAt).toLocaleString("zh-CN")
        : undefined,
      className: "text-xs",
    },
  ];

  return (
    <div className="space-y-6 pt-4">
      <h3 className="text-xl font-bold text-[#0b1c30] border-l-4 border-[#005daa] pl-4">
        房源信息摘要
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-12 p-8 bg-white rounded-2xl border border-[#c0c7d6]/10">
        {infoItems.map((item, index) => (
          <div
            key={index}
            className="flex justify-between items-center border-b border-[#c0c7d6]/10 pb-2"
          >
            <span className="text-[#707785] text-sm font-medium">
              {item.label}
            </span>
            <span
              className={`text-[#0b1c30] font-semibold ${item.className || ""}`}
            >
              {item.value || "--"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
