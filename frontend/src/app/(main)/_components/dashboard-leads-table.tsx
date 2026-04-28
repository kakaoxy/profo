import { ClipboardCheck, UserCircle2 } from "lucide-react";
import Link from "next/link";
import type { DashboardLead } from "../types";

interface DashboardLeadsTableProps {
  leads: DashboardLead[];
}

export function DashboardLeadsTable({ leads }: DashboardLeadsTableProps) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-card p-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-primary/10 rounded-lg">
            <ClipboardCheck className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              近期线索跟进 Active Leads
            </h3>
            <p className="text-xs text-slate-400">
              实时追踪线索动态与转化进度
            </p>
          </div>
        </div>
        <Link
          href="/leads"
          className="text-primary font-bold text-sm bg-primary/5 px-4 py-2 rounded-full hover:bg-primary/10 transition-colors"
        >
          查看全部线索 View All
        </Link>
      </div>

      <div className="overflow-x-auto -mx-8">
        <table className="w-full text-left min-w-[1200px]">
          <thead className="bg-slate-50/50 dark:bg-slate-800/50">
            <tr className="text-[10px] text-slate-400 uppercase tracking-widest border-y border-slate-100 dark:border-slate-700">
              <th className="pl-8 pr-4 py-4 font-black">小区 (Property)</th>
              <th className="px-4 py-4 font-black">户型</th>
              <th className="px-4 py-4 font-black">面积</th>
              <th className="px-4 py-4 font-black">楼层</th>
              <th className="px-4 py-4 font-black">总价</th>
              <th className="px-4 py-4 font-black">单价</th>
              <th className="px-4 py-4 font-black">状态 (Status)</th>
              <th className="px-4 py-4 font-black">区域 (Region)</th>
              <th className="px-4 py-4 font-black">录入人 (Creator)</th>
              <th className="px-4 py-4 font-black text-right pr-8">
                更新时间 (Updated)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {leads.map((lead) => (
              <tr
                key={lead.id}
                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/80 transition-colors cursor-pointer group"
              >
                <td className="pl-8 pr-4 py-5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/5 text-primary flex items-center justify-center font-black text-xs border border-primary/10">
                      {lead.community?.[0] ?? '?'}
                    </div>
                    <span className="text-slate-800 dark:text-slate-200 font-semibold text-sm">
                      {lead.community}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-5 text-sm font-medium text-slate-600 dark:text-slate-400">
                  {lead.unitType}
                </td>
                <td className="px-4 py-5 text-sm font-medium text-slate-600 dark:text-slate-400">
                  {lead.area}
                </td>
                <td className="px-4 py-5 text-sm font-medium text-slate-500 dark:text-slate-500">
                  {lead.floor}
                </td>
                <td className="px-4 py-5 text-sm font-black text-primary">
                  {lead.totalPrice}
                </td>
                <td className="px-4 py-5 text-xs font-semibold text-slate-500 dark:text-slate-500">
                  {lead.unitPrice}
                </td>
                <td className="px-4 py-5">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold ${
                      lead.status === "已出价"
                        ? "bg-tertiary/10 text-tertiary"
                        : lead.status === "带看中"
                        ? "bg-primary/10 text-primary"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                    }`}
                  >
                    {lead.status}
                  </span>
                </td>
                <td className="px-4 py-5 text-sm font-medium text-slate-600 dark:text-slate-400">
                  {lead.region}
                </td>
                <td className="px-4 py-5">
                  <div className="flex items-center gap-2">
                    <UserCircle2 className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                      {lead.creator}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-5 pr-8 text-xs text-slate-400 text-right font-medium italic">
                  {lead.updatedTime}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
