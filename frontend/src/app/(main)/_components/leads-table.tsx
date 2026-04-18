import Link from "next/link";
import { ClipboardList, ChevronRight } from "lucide-react";

interface Lead {
  id: string;
  community_name: string;
  layout?: string | null;
  area?: number | null;
  orientation?: string | null;
  total_price?: number | null;
  created_at: string;
}

interface LeadsTableProps {
  leads: Lead[];
  formatCurrency: (amount?: number | string) => string;
  formatRelativeTime: (dateStr: string) => string;
}

export function LeadsTable({ leads, formatCurrency, formatRelativeTime }: LeadsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-800/50 text-xs uppercase text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-700">
            <th className="px-4 sm:px-6 py-4 font-semibold tracking-wider">
              房源/小区
            </th>
            <th className="px-4 sm:px-6 py-4 font-semibold tracking-wider hidden sm:table-cell">
              户型
            </th>
            <th className="px-4 sm:px-6 py-4 font-semibold tracking-wider hidden md:table-cell">
              面积
            </th>
            <th className="px-4 sm:px-6 py-4 font-semibold tracking-wider hidden lg:table-cell">
              朝向
            </th>
            <th className="px-4 sm:px-6 py-4 font-semibold tracking-wider">
              预估总价
            </th>
            <th className="px-4 sm:px-6 py-4 font-semibold tracking-wider hidden md:table-cell text-right">
              接收时间
            </th>
            <th className="px-4 sm:px-6 py-4 font-semibold tracking-wider text-right w-16"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
          {leads.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-6 py-16 text-center">
                <div className="flex flex-col items-center justify-center text-slate-400 dark:text-slate-500">
                  <div className="w-16 h-16 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                    <ClipboardList className="w-8 h-8 opacity-50" />
                  </div>
                  <p className="text-sm font-medium">暂无待处理线索</p>
                  <p className="text-xs mt-1 opacity-70">
                    所有线索都已评估完毕
                  </p>
                </div>
              </td>
            </tr>
          ) : (
            leads.map((lead) => (
              <tr
                key={lead.id}
                className="group hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-colors relative cursor-pointer"
              >
                <td className="px-4 sm:px-6 py-4">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {lead.community_name}
                    </span>
                    <div className="flex items-center gap-2 mt-1 sm:hidden text-xs text-slate-500">
                      <span>{lead.layout || "-"}</span>
                      <span className="w-0.5 h-0.5 bg-slate-300 rounded-full"></span>
                      <span>{lead.area ? `${lead.area}㎡` : ""}</span>
                    </div>
                  </div>
                  <Link
                    href={`/leads?leadId=${lead.id}`}
                    className="absolute inset-0 z-10"
                    aria-label="查看详情"
                  />
                </td>

                <td className="px-4 sm:px-6 py-4 text-sm text-slate-600 dark:text-slate-300 hidden sm:table-cell">
                  {lead.layout || "-"}
                </td>
                <td className="px-4 sm:px-6 py-4 text-sm text-slate-600 dark:text-slate-300 hidden md:table-cell tabular-nums">
                  {lead.area ? `${lead.area}㎡` : "-"}
                </td>
                <td className="px-4 sm:px-6 py-4 text-sm text-slate-600 dark:text-slate-300 hidden lg:table-cell">
                  {lead.orientation || "-"}
                </td>

                <td className="px-4 sm:px-6 py-4">
                  <div className="text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">
                    {lead.total_price ? (
                      <>
                        <span className="text-xs font-normal text-slate-400 mr-0.5">
                          ¥
                        </span>
                        {formatCurrency(lead.total_price)}
                      </>
                    ) : (
                      "-"
                    )}
                  </div>
                </td>

                <td className="px-4 sm:px-6 py-4 text-sm text-slate-400 hidden md:table-cell text-right">
                  {formatRelativeTime(lead.created_at)}
                </td>

                <td className="px-4 sm:px-6 py-4 text-right">
                  <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors ml-auto" />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
