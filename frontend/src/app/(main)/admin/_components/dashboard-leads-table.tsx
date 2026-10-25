"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { UserCircle2, ClipboardList } from "lucide-react";
import type { RawDashboardLead } from "../types";
import { getStatusStyleConfig } from "@/lib/status-colors";
import {
  formatAreaSqm,
  formatPriceWan,
  formatUnitPriceWan,
  formatDashboardDateTime,
} from "@/lib/formatters";
import { DashboardLeadsCardList } from "./dashboard-leads-card-list";
import { WidgetHead } from "./widgets/widget-head";

interface DashboardLeadsTableProps {
  leads: RawDashboardLead[];
}

export function DashboardLeadsTable({ leads }: DashboardLeadsTableProps) {
  const router = useRouter();
  const isEmpty = leads.length === 0;

  const handleRowClick = useCallback(
    (id: string) => {
      router.push(`/admin/leads/${id}`);
    },
    [router],
  );

  return (
    <section
      aria-label="最近线索"
      className="flex min-w-0 flex-1 flex-col rounded-cards bg-white px-[22px] py-5 shadow-steep-sm"
    >
      <WidgetHead title="最近线索" link="全部线索" href="/admin/leads" />

      <div className="overflow-hidden">
        {/* 11 列表格需要 ≥lg 才不被挤压；窄屏走卡片列表 */}
        <div className="hidden lg:block overflow-x-auto px-2 md:px-3 pb-2">
          <table className="w-full text-left" aria-label="近期线索跟进列表">
            <caption className="sr-only">
              近期线索跟进列表，包含小区、户型、面积、楼层、总价、单价、状态、区域、录入人与更新时间
            </caption>
            <thead>
              <tr className="text-[12.5px] text-graphite tracking-[0.02em] border-b border-dove/35">
                <th scope="col" className="pl-4 pr-2 py-3.5 font-medium whitespace-nowrap">
                  小区
                </th>
                <th
                  scope="col"
                  className="px-2 py-3.5 font-medium hidden md:table-cell whitespace-nowrap"
                >
                  户型
                </th>
                <th
                  scope="col"
                  className="px-2 py-3.5 font-medium hidden md:table-cell whitespace-nowrap"
                >
                  面积
                </th>
                <th
                  scope="col"
                  className="px-2 py-3.5 font-medium hidden md:table-cell whitespace-nowrap"
                >
                  楼层
                </th>
                <th scope="col" className="px-2 py-3.5 font-medium whitespace-nowrap">
                  总价
                </th>
                <th
                  scope="col"
                  className="px-2 py-3.5 font-medium hidden md:table-cell whitespace-nowrap"
                >
                  单价
                </th>
                <th scope="col" className="px-2 py-3.5 font-medium whitespace-nowrap">
                  评估价
                </th>
                <th scope="col" className="px-2 py-3.5 font-medium whitespace-nowrap">
                  状态
                </th>
                <th
                  scope="col"
                  className="px-2 py-3.5 font-medium hidden md:table-cell whitespace-nowrap"
                >
                  区域
                </th>
                <th
                  scope="col"
                  className="px-2 py-3.5 font-medium hidden md:table-cell whitespace-nowrap"
                >
                  录入人
                </th>
                <th
                  scope="col"
                  className="pl-2 pr-4 py-3.5 font-medium text-right whitespace-nowrap"
                >
                  更新时间
                </th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0 [&>tr>td]:border-b [&>tr>td]:border-dove/18">
              {isEmpty ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-graphite">
                      <div className="w-16 h-16 bg-fog rounded-full flex items-center justify-center mb-4">
                        <ClipboardList className="w-8 h-8 opacity-50" aria-hidden="true" />
                      </div>
                      <p className="text-sm font-medium">暂无线索数据</p>
                      <p className="text-xs mt-1 opacity-70">当前没有符合条件的线索记录</p>
                    </div>
                  </td>
                </tr>
              ) : (
                leads.map((lead) => {
                  const config = getStatusStyleConfig(lead.status);
                  return (
                    <tr
                      key={lead.id}
                      className="hover:bg-fog transition-colors group cursor-pointer"
                      onClick={() => handleRowClick(lead.id)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleRowClick(lead.id);
                        }
                      }}
                    >
                      <td className="pl-4 pr-2 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-[26px] h-[26px] rounded-full bg-sky-wash text-ink flex items-center justify-center font-medium text-[11px] shrink-0">
                            <span aria-hidden="true">{lead.community?.[0] ?? "?"}</span>
                          </div>
                          <span className="text-ink font-[480] text-sm truncate max-w-[100px]">
                            {lead.community}
                          </span>
                        </div>
                      </td>
                      <td className="px-2 py-3.5 text-sm text-ash hidden md:table-cell">
                        {lead.unitType}
                      </td>
                      <td className="px-2 py-3.5 text-sm text-ash hidden md:table-cell tabular-nums">
                        {formatAreaSqm(lead.area)}
                      </td>
                      <td className="px-2 py-3.5 text-sm text-ash hidden md:table-cell">
                        {lead.floor}
                      </td>
                      <td className="px-2 py-3.5 text-sm font-[480] text-ink tabular-nums">
                        {formatPriceWan(lead.totalPrice)}
                      </td>
                      <td className="px-2 py-3.5 text-xs text-ash hidden md:table-cell tabular-nums">
                        {formatUnitPriceWan(lead.unitPrice)}
                      </td>
                      <td className="px-2 py-3.5 text-sm font-[450] text-ink tabular-nums">
                        {formatPriceWan(lead.evalPrice)}
                      </td>
                      <td className="px-2 py-3.5">
                        <span
                          className={`inline-flex items-center px-[11px] py-[3.5px] rounded-full text-[12.5px] font-[450] whitespace-nowrap ${config.className}`}
                        >
                          {config.label}
                        </span>
                      </td>
                      <td className="px-2 py-3.5 text-sm text-ash hidden md:table-cell">
                        {lead.region}
                      </td>
                      <td className="px-2 py-3.5 hidden md:table-cell">
                        <div className="flex items-center gap-2">
                          <UserCircle2 className="w-4 h-4 text-dove shrink-0" aria-hidden="true" />
                          <span className="text-[13px] font-[450] text-ash truncate">
                            {lead.creator}
                          </span>
                        </div>
                      </td>
                      <td className="pl-2 pr-4 py-3.5 text-[13px] text-graphite text-right font-[450] whitespace-nowrap tabular-nums">
                        {formatDashboardDateTime(lead.updatedAt)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="lg:hidden px-4 pb-6 pt-2">
          <DashboardLeadsCardList leads={leads} />
        </div>
      </div>
    </section>
  );
}
