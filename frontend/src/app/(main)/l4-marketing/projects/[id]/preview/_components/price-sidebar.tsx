"use client";

import Link from "next/link";
import { formatPrice, formatUnitPrice } from "@/lib/formatters";

interface PriceSidebarProps {
  projectId: number;
  totalPrice?: string | number;
  unitPrice?: string | number;
  area?: string | number;
}

export function PriceSidebar({
  projectId,
  totalPrice,
  unitPrice,
  area,
}: PriceSidebarProps) {
  return (
    <div className="lg:sticky lg:top-28 space-y-6">
      <div className="bg-white p-8 rounded-3xl border border-[#c0c7d6]/10 shadow-sm">
        <div className="flex flex-col gap-1 mb-6">
          <span className="text-[#707785] text-sm font-medium">房源总价</span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-[#005daa] tracking-tight">
              {formatPrice(totalPrice)}
            </span>
            <span className="text-lg font-bold text-[#005daa]">万</span>
          </div>
          <div className="mt-1 text-sm font-medium text-[#707785]">
            单价：{formatUnitPrice(unitPrice)}
          </div>
        </div>

        {/* Responsible Person */}
        <div className="mt-8 pt-8 border-t border-[#c0c7d6]/10 flex flex-col gap-4">
          <span className="text-[10px] font-bold text-[#707785] uppercase tracking-wider">
            房源责任人
          </span>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-[#d3e4fe] flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#005daa"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <div className="text-[#0b1c30] font-bold">管理员</div>
              <div className="text-[#707785] text-xs">房源审核员</div>
            </div>
          </div>
        </div>

        <div className="space-y-4 mt-8">
          <Link
            href={`/l4-marketing/projects/${projectId}/edit`}
            className="w-full bg-[#005daa] hover:bg-[#0075d5] text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            修改信息
          </Link>
        </div>
      </div>

      {/* Quick Context */}
      <div className="bg-[#005daa]/5 p-6 rounded-3xl space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#005daa]/10 rounded-lg text-[#005daa]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" x2="12" y1="16" y2="12" />
              <line x1="12" x2="12.01" y1="8" y2="8" />
            </svg>
          </div>
          <div>
            <div className="text-xs text-[#707785]">提示</div>
            <div className="text-sm font-bold text-[#0b1c30]">
              预览模式仅显示核心字段
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
