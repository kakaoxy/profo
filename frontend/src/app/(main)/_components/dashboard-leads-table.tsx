import { ClipboardCheck, UserCircle2, ClipboardList } from "lucide-react";
import Link from "next/link";
import type { DashboardLead } from "../types";

interface DashboardLeadsTableProps {
  leads: DashboardLead[];
}

// 状态样式映射 - 移到组件外部避免每次渲染重新创建
const STATUS_MAP: Record<string, string> = {
  "待评估": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "待看房": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "已驳回": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "已看房": "bg-primary/10 text-primary",
  "已签约": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

const DEFAULT_STATUS_CLASS =
  "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400";

/**
 * 获取状态对应的样式类名
 */
function getStatusClassName(status: string): string {
  return STATUS_MAP[status] || DEFAULT_STATUS_CLASS;
}

export function DashboardLeadsTable({ leads }: DashboardLeadsTableProps) {
  const isEmpty = leads.length === 0;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card">
      <div className="flex items-center justify-between mb-6 px-4 md:px-6 pt-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <ClipboardCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              近期线索跟进
            </h3>
            <p className="text-xs text-slate-400">
              实时追踪线索动态与转化进度
            </p>
          </div>
        </div>
        <Link
          href="/leads"
          className="text-primary font-bold text-xs bg-primary/5 px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors"
        >
          查看全部
        </Link>
      </div>

      <div className="overflow-x-auto px-4 md:px-6 pb-6">
        <table className="w-full text-left">
          <thead className="bg-slate-50/50 dark:bg-slate-800/50">
            <tr className="text-[10px] text-slate-400 uppercase tracking-widest border-y border-slate-100 dark:border-slate-700">
              <th className="pl-0 pr-2 py-3 font-black">小区</th>
              <th className="px-2 py-3 font-black hidden md:table-cell">户型</th>
              <th className="px-2 py-3 font-black hidden lg:table-cell">面积</th>
              <th className="px-2 py-3 font-black hidden lg:table-cell">楼层</th>
              <th className="px-2 py-3 font-black">总价</th>
              <th className="px-2 py-3 font-black hidden sm:table-cell">单价</th>
              <th className="px-2 py-3 font-black">状态</th>
              <th className="px-2 py-3 font-black hidden xl:table-cell">区域</th>
              <th className="px-2 py-3 font-black hidden xl:table-cell">录入人</th>
              <th className="pl-2 pr-0 py-3 font-black text-right">更新时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {isEmpty ? (
              <tr>
                <td colSpan={10} className="py-12 text-center">
                  <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                    <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                      <ClipboardList className="w-8 h-8 opacity-50" />
                    </div>
                    <p className="text-sm font-medium">暂无线索数据</p>
                    <p className="text-xs mt-1 opacity-70">
                      当前没有符合条件的线索记录
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              leads.map((lead) => (
                <tr
                  key={lead.id}
                  className="hover:bg-slate-50/80 dark:hover:bg-slate-800/80 transition-colors group"
                >
                  <td className="pl-0 pr-2 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/5 text-primary flex items-center justify-center font-black text-[10px] border border-primary/10 shrink-0">
                        {lead.community?.[0] ?? "?"}
                      </div>
                      <span className="text-slate-800 dark:text-slate-200 font-semibold text-sm truncate max-w-[100px]">
                        {lead.community}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-4 text-sm font-medium text-slate-600 dark:text-slate-400 hidden md:table-cell">
                    {lead.unitType}
                  </td>
                  <td className="px-2 py-4 text-sm font-medium text-slate-600 dark:text-slate-400 hidden lg:table-cell">
                    {lead.area}
                  </td>
                  <td className="px-2 py-4 text-sm font-medium text-slate-500 dark:text-slate-500 hidden lg:table-cell">
                    {lead.floor}
                  </td>
                  <td className="px-2 py-4 text-sm font-black text-primary">
                    {lead.totalPrice}
                  </td>
                  <td className="px-2 py-4 text-xs font-semibold text-slate-500 dark:text-slate-500 hidden sm:table-cell">
                    {lead.unitPrice}
                  </td>
                  <td className="px-2 py-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${getStatusClassName(lead.status)}`}
                    >
                      {lead.status}
                    </span>
                  </td>
                  <td className="px-2 py-4 text-sm font-medium text-slate-600 dark:text-slate-400 hidden xl:table-cell">
                    {lead.region}
                  </td>
                  <td className="px-2 py-4 hidden xl:table-cell">
                    <div className="flex items-center gap-2">
                      <UserCircle2 className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0" />
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400 truncate">
                        {lead.creator}
                      </span>
                    </div>
                  </td>
                  <td className="pl-2 pr-0 py-4 text-xs text-slate-400 text-right font-medium italic whitespace-nowrap">
                    {lead.updatedTime}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
