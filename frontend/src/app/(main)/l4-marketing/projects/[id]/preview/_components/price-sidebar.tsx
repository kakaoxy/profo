"use client";

import Link from "next/link";
import { formatPrice, formatUnitPrice } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Pencil, Info } from "lucide-react";

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
      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex flex-col gap-1 mb-6">
          <span className="text-slate-500 text-sm font-medium">房源总价</span>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-blue-600 tracking-tight">
              {formatPrice(totalPrice)}
            </span>
          </div>
          <div className="mt-1 text-sm text-slate-500">
            单价：{formatUnitPrice(unitPrice)}
          </div>
        </div>

        {/* Responsible Person */}
        <div className="mt-8 pt-8 border-t border-slate-200 flex flex-col gap-4">
          <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
            房源责任人
          </span>
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-slate-400"
              >
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div>
              <div className="text-slate-800 font-medium">管理员</div>
              <div className="text-slate-500 text-xs">房源审核员</div>
            </div>
          </div>
        </div>

        <div className="space-y-4 mt-8">
          <Link href={`/l4-marketing/projects/${projectId}/edit`}>
            <Button className="w-full bg-blue-600 hover:bg-blue-700">
              <Pencil className="mr-2 h-4 w-4" />
              修改信息
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Context */}
      <div className="bg-slate-50 p-6 rounded-xl space-y-4 border border-slate-200">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
            <Info className="h-4 w-4" />
          </div>
          <div>
            <div className="text-xs text-slate-500">提示</div>
            <div className="text-sm font-medium text-slate-700">
              预览模式仅显示核心字段
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
