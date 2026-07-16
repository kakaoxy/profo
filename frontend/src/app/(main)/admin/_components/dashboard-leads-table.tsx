import { ClipboardCheck, UserCircle2, ClipboardList } from "lucide-react";
import Link from "next/link";
import type { RawDashboardLead } from "../types";
import {
  getLeadStatusBadgeClass,
  getStatusLabel,
} from "@/lib/status-colors";
import {
  formatAreaSqm,
  formatPriceWan,
  formatUnitPriceWan,
  formatDashboardDateTime,
} from "@/lib/formatters";

interface DashboardLeadsTableProps {
  leads: RawDashboardLead[];
}

export function DashboardLeadsTable({ leads }: DashboardLeadsTableProps) {
  const isEmpty = leads.length === 0;

  return (
    <div className="bg-card rounded-2xl border border-border shadow-card">
      <div className="flex items-center justify-between mb-6 px-4 md:px-6 pt-6">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <ClipboardCheck className="w-5 h-5 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-foreground">
              近期线索跟进
            </h2>
            <p className="text-xs text-muted-foreground">
              实时追踪线索动态与转化进度
            </p>
          </div>
        </div>
        <Link
          href="/admin/leads"
          className="text-primary font-bold text-xs bg-primary/5 px-3 py-1.5 rounded-full hover:bg-primary/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          查看全部
        </Link>
      </div>

      <div className="overflow-x-auto px-4 md:px-6 pb-6">
        <table className="w-full text-left" aria-label="近期线索跟进列表">
          <caption className="sr-only">
            近期线索跟进列表，包含小区、户型、面积、楼层、总价、单价、状态、区域、录入人与更新时间
          </caption>
          <thead className="bg-muted">
            <tr className="text-[10px] text-muted-foreground uppercase tracking-widest border-y border-border">
              <th scope="col" className="pl-0 pr-2 py-3 font-black">小区</th>
              <th scope="col" className="px-2 py-3 font-black hidden md:table-cell">户型</th>
              <th scope="col" className="px-2 py-3 font-black hidden md:table-cell">面积</th>
              <th scope="col" className="px-2 py-3 font-black hidden md:table-cell">楼层</th>
              <th scope="col" className="px-2 py-3 font-black">总价</th>
              <th scope="col" className="px-2 py-3 font-black hidden md:table-cell">单价</th>
              <th scope="col" className="px-2 py-3 font-black">状态</th>
              <th scope="col" className="px-2 py-3 font-black hidden md:table-cell">区域</th>
              <th scope="col" className="px-2 py-3 font-black hidden md:table-cell">录入人</th>
              <th scope="col" className="pl-2 pr-0 py-3 font-black text-right">更新时间</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isEmpty ? (
              <tr>
                <td colSpan={10} className="py-12 text-center">
                  <div className="flex flex-col items-center justify-center text-muted-foreground">
                    <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                      <ClipboardList className="w-8 h-8 opacity-50" aria-hidden="true" />
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
                  className="hover:bg-muted transition-colors group"
                >
                  <td className="pl-0 pr-2 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/5 text-primary flex items-center justify-center font-black text-[10px] border border-primary/10 shrink-0">
                        <span aria-hidden="true">{lead.community?.[0] ?? "?"}</span>
                      </div>
                      <span className="text-foreground font-semibold text-sm truncate max-w-[100px]">
                        {lead.community}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-4 text-sm font-medium text-muted-foreground hidden md:table-cell">
                    {lead.unitType}
                  </td>
                  <td className="px-2 py-4 text-sm font-medium text-muted-foreground hidden md:table-cell tabular-nums">
                    {formatAreaSqm(lead.area)}
                  </td>
                  <td className="px-2 py-4 text-sm font-medium text-muted-foreground hidden md:table-cell">
                    {lead.floor}
                  </td>
                  <td className="px-2 py-4 text-sm font-black text-primary tabular-nums">
                    {formatPriceWan(lead.totalPrice)}
                  </td>
                  <td className="px-2 py-4 text-xs font-semibold text-muted-foreground hidden md:table-cell tabular-nums">
                    {formatUnitPriceWan(lead.unitPrice)}
                  </td>
                  <td className="px-2 py-4">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${getLeadStatusBadgeClass(lead.status)}`}
                    >
                      {getStatusLabel(lead.status)}
                    </span>
                  </td>
                  <td className="px-2 py-4 text-sm font-medium text-muted-foreground hidden md:table-cell">
                    {lead.region}
                  </td>
                  <td className="px-2 py-4 hidden md:table-cell">
                    <div className="flex items-center gap-2">
                      <UserCircle2 className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                      <span className="text-sm font-medium text-muted-foreground truncate">
                        {lead.creator}
                      </span>
                    </div>
                  </td>
                  <td className="pl-2 pr-0 py-4 text-xs text-muted-foreground text-right font-medium italic whitespace-nowrap tabular-nums">
                    {formatDashboardDateTime(lead.updatedAt)}
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
