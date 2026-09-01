"use client";

import { Loader2 } from "lucide-react";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { safeFormatDate } from "@/lib/formatters";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { components } from "@/lib/api-types";
import type { UnifiedLeadStatus } from "../../types";
import {
  GROWTH_MODULE_META,
  GROWTH_SOURCE_META,
  GROWTH_STATUS_META,
  PHASE_2_LABEL,
} from "../../types";

type UnifiedLeadListItem = components["schemas"]["UnifiedLeadListItem"];

interface LeadsTableProps {
  /** 当前页线索（已由服务端完成筛选与分页） */
  leads: UnifiedLeadListItem[];
  /** 状态流转回调（仅招募行触发，由 view 调用 Server Action） */
  onFlow: (leadId: string, targetStatus: UnifiedLeadStatus) => void;
  /** 详情回调（打开抽屉） */
  onDetail: (lead: UnifiedLeadListItem) => void;
  /** 正在流转状态的线索 ID（null 表示无操作进行中） */
  flowingId: string | null;
}

/** 药丸 Badge 基础样式（与设计稿 .badge 一致） */
const badgeBase =
  "inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-0.5 rounded-full whitespace-nowrap";

/** 所有可流转的目标状态（统一 5 态） */
const STATUS_OPTIONS: UnifiedLeadStatus[] = [
  "new",
  "contacted",
  "high_intent",
  "converted",
  "eliminated",
];

/**
 * 统一线索明细表格（对齐设计稿 Screen 2 列结构）：
 * `客户 / 来源模块 / 状态 / 活动归属 / 归属员工 / 来源 / 留资时间 / 操作`。
 * 状态列展示统一 5 态 Badge + 原状态子标签；状态流转仅招募行渲染。
 */
export function LeadsTable({ leads, onFlow, onDetail, flowingId }: LeadsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1120px] border-collapse text-[14px]">
        <thead>
          <tr className="text-left text-[13px] font-medium text-graphite whitespace-nowrap">
            <th className="px-5 py-3 border-b border-fog">客户</th>
            <th className="px-5 py-3 border-b border-fog">来源模块</th>
            <th className="px-5 py-3 border-b border-fog">状态</th>
            <th className="px-5 py-3 border-b border-fog">
              <span className="inline-flex items-center gap-1.5">
                活动归属
                <span className="text-[11px] text-slate">{PHASE_2_LABEL}</span>
              </span>
            </th>
            <th className="px-5 py-3 border-b border-fog">归属员工</th>
            <th className="px-5 py-3 border-b border-fog">来源</th>
            <th className="px-5 py-3 border-b border-fog">留资时间</th>
            <th className="px-5 py-3 border-b border-fog text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {leads.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-5 py-10 text-center text-[13px] text-slate">
                暂无符合条件的数据
              </td>
            </tr>
          ) : (
            leads.map((lead) => (
              <tr key={`${lead.module}-${lead.id}`} className="hover:bg-fog transition-colors">
                <td className="px-5 py-3.5 border-b border-fog align-middle">
                  <div className="font-medium text-ink tabular-nums whitespace-nowrap">
                    {lead.phone_masked ?? "—"}
                  </div>
                  {lead.is_internal ? (
                    <div className="mt-0.5 text-[12.5px] text-graphite">内部员工标记</div>
                  ) : (
                    <div className="mt-0.5 text-xs text-rust font-medium">有效新客</div>
                  )}
                </td>
                <td className="px-5 py-3.5 border-b border-fog align-middle">
                  <span className={`${badgeBase} ${GROWTH_MODULE_META[lead.module].badge}`}>
                    {GROWTH_MODULE_META[lead.module].label}
                  </span>
                </td>
                <td className="px-5 py-3.5 border-b border-fog align-middle">
                  <span className={`${badgeBase} ${GROWTH_STATUS_META[lead.unified_status].badge}`}>
                    {GROWTH_STATUS_META[lead.unified_status].label}
                  </span>
                  <div className="mt-0.5 text-[12.5px] text-graphite whitespace-nowrap">
                    原状态：{lead.native_status}
                  </div>
                </td>
                <td className="px-5 py-3.5 border-b border-fog align-middle whitespace-nowrap">
                  {lead.module === "recruit" ? (
                    <span className="text-[13px] text-ink">{lead.campaign_name ?? "—"}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-[#c9ccd4]">—</span>
                      <span className="text-[11px] text-slate">{PHASE_2_LABEL}</span>
                    </span>
                  )}
                </td>
                <td className="px-5 py-3.5 border-b border-fog align-middle">
                  <div className="font-medium text-ink whitespace-nowrap">
                    {lead.employee_name ?? "—"}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-graphite">
                    员工ID: {lead.employee_id ?? "—"}
                  </div>
                </td>
                <td className="px-5 py-3.5 border-b border-fog align-middle">
                  {lead.source ? (
                    <span className={`${badgeBase} ${GROWTH_SOURCE_META[lead.source].badge}`}>
                      {GROWTH_SOURCE_META[lead.source].label}
                    </span>
                  ) : (
                    <span className="text-[#c9ccd4]">—</span>
                  )}
                </td>
                <td className="px-5 py-3.5 border-b border-fog align-middle text-[12.5px] text-graphite tabular-nums whitespace-nowrap">
                  {safeFormatDate(lead.created_at, "yyyy-MM-dd HH:mm")}
                </td>
                <td className="px-5 py-3.5 border-b border-fog align-middle">
                  <div className="flex items-center justify-end gap-3">
                    <button
                      type="button"
                      className="text-[14px] font-medium text-ink px-0.5 hover:opacity-60 transition-opacity"
                      onClick={() => onDetail(lead)}
                    >
                      详情
                    </button>
                    {lead.module === "recruit" && (
                      <HasPermission code={PERMISSION_CODES.RECRUIT_WRITE}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              type="button"
                              disabled={flowingId === lead.id}
                              className="text-[14px] font-medium text-ink px-0.5 hover:opacity-60 transition-opacity disabled:opacity-50 inline-flex items-center gap-1"
                            >
                              {flowingId === lead.id && (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              )}
                              流转状态
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {STATUS_OPTIONS.filter((s) => s !== lead.unified_status).map(
                              (status) => (
                                <DropdownMenuItem
                                  key={status}
                                  onClick={() => onFlow(lead.id, status)}
                                >
                                  {GROWTH_STATUS_META[status].label}
                                </DropdownMenuItem>
                              ),
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </HasPermission>
                    )}
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
