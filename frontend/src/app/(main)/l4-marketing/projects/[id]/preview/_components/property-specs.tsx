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
    <div className="grid grid-cols-2 md:grid-cols-4 gap-0.5 rounded-xl overflow-hidden bg-slate-200 border border-slate-200">
      <div className="bg-slate-50 p-6 flex flex-col gap-1">
        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
          户型
        </span>
        <span className="text-lg font-bold text-slate-800">{layout || "--"}</span>
      </div>
      <div className="bg-slate-50 p-6 flex flex-col gap-1">
        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
          面积
        </span>
        <span className="text-lg font-bold text-slate-800">
          {formatArea(area)}
        </span>
      </div>
      <div className="bg-slate-50 p-6 flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
            单价
          </span>
          <span className="text-[8px] bg-blue-100 text-blue-700 px-1 rounded">
            自动计算
          </span>
        </div>
        <span className="text-lg font-bold text-slate-800">
          {formatUnitPrice(unitPrice)}
        </span>
      </div>
      <div className="bg-slate-50 p-6 flex flex-col gap-1">
        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
          朝向
        </span>
        <span className="text-lg font-bold text-slate-800">
          {orientation || "--"}
        </span>
      </div>
    </div>
  );
}
