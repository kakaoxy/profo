"use client";

import { formatArea, formatUnitPrice } from "@/lib/formatters";

interface PropertySpecsProps {
  layout?: string;
  area?: string | number;
  unitPrice?: string | number;
  orientation?: string;
}

export function PropertySpecs({
  layout,
  area,
  unitPrice,
  orientation,
}: PropertySpecsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-0.5 rounded-2xl overflow-hidden bg-[#c0c7d6]/10 border border-[#c0c7d6]/10">
      <div className="bg-[#eff4ff] p-6 flex flex-col gap-1">
        <span className="text-[10px] font-bold text-[#707785] uppercase tracking-wider">
          户型
        </span>
        <span className="text-lg font-bold text-[#0b1c30]">{layout || "--"}</span>
      </div>
      <div className="bg-[#eff4ff] p-6 flex flex-col gap-1">
        <span className="text-[10px] font-bold text-[#707785] uppercase tracking-wider">
          面积
        </span>
        <span className="text-lg font-bold text-[#0b1c30]">
          {formatArea(area)}㎡
        </span>
      </div>
      <div className="bg-[#eff4ff] p-6 flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-bold text-[#707785] uppercase tracking-wider">
            单价
          </span>
          <span className="text-[8px] bg-[#005daa]/10 text-[#005daa] px-1 rounded">
            自动计算
          </span>
        </div>
        <span className="text-lg font-bold text-[#0b1c30]">
          {formatUnitPrice(unitPrice)}
        </span>
      </div>
      <div className="bg-[#eff4ff] p-6 flex flex-col gap-1">
        <span className="text-[10px] font-bold text-[#707785] uppercase tracking-wider">
          朝向
        </span>
        <span className="text-lg font-bold text-[#0b1c30]">
          {orientation || "--"}
        </span>
      </div>
    </div>
  );
}
