"use client";

import { Loader2 } from "lucide-react";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { safeFormatDate } from "@/lib/formatters";
import type {
  RecruitLead,
  RecruitLeadStatus,
  RecruitSource,
} from "../../types";
import {
  RECRUIT_BADGE_CLASS,
  RECRUIT_LEAD_STATUS_LABELS,
  RECRUIT_SOURCE_LABELS,
} from "../../types";

interface LeadsTableProps {
  /** 当前页线索（已由服务端完成筛选与分页） */
  leads: RecruitLead[];
  /** 状态流转回调（沿状态流前进一级，由 view 调用 Server Action） */
  onFlow: (leadId: string) => void;
  /** 详情（占位：二期跳转线索详情） */
  onDetail: () => void;
  /** 正在流转状态的线索 ID（null 表示无操作进行中） */
  flowingId: string | null;
}

/** 线索状态 Badge 配色（对齐设计稿：新线索 Sky / 已联系 Neutral / 意向高 Apricot / 已转化 Ink / 已淘汰 Muted） */
const LEAD_STATUS_BADGE: Record<RecruitLeadStatus, string> = {
  new: RECRUIT_BADGE_CLASS.sky,
  contacted: RECRUIT_BADGE_CLASS.neutral,
  high_intent: RECRUIT_BADGE_CLASS.apricot,
  converted: RECRUIT_BADGE_CLASS.ink,
  eliminated: RECRUIT_BADGE_CLASS.muted,
};

/** 线索来源 Badge 配色（设计稿为 Outline 轮廓样式） */
const SOURCE_BADGE: Record<RecruitSource, string> = {
  card: RECRUIT_BADGE_CLASS.outline,
  poster: RECRUIT_BADGE_CLASS.outline,
};

/** 药丸 Badge 基础样式（与设计稿 .badge 一致） */
const badgeBase =
  "inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-0.5 rounded-full whitespace-nowrap";

/**
 * 线索明细表格：对齐设计稿列结构
 * `手机号 / 主营商圈 / 归属员工 / 来源 / 状态 / 留资时间 / 操作`。
 * 操作：流转状态（写权限）+ 详情。
 */
export function LeadsTable({ leads, onFlow, onDetail, flowingId }: LeadsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr className="text-left text-[13px] font-medium text-graphite whitespace-nowrap">
            <th className="px-5 py-3 border-b border-fog">手机号</th>
            <th className="px-5 py-3 border-b border-fog">主营商圈</th>
            <th className="px-5 py-3 border-b border-fog">归属员工</th>
            <th className="px-5 py-3 border-b border-fog">来源</th>
            <th className="px-5 py-3 border-b border-fog">状态</th>
            <th className="px-5 py-3 border-b border-fog">留资时间</th>
            <th className="px-5 py-3 border-b border-fog text-right">操作</th>
          </tr>
        </thead>
        <tbody>
          {leads.length === 0 ? (
            <tr>
              <td
                colSpan={7}
                className="px-5 py-10 text-center text-[13px] text-slate"
              >
                暂无数据
              </td>
            </tr>
          ) : (
            leads.map((lead) => (
              <tr key={lead.id} className="hover:bg-fog transition-colors">
                <td className="px-5 py-3.5 border-b border-fog align-middle">
                  <div className="font-medium text-ink tabular-nums whitespace-nowrap">
                    {lead.phone_masked ?? "—"}
                  </div>
                  {lead.is_internal ? (
                    <div className="mt-0.5 text-[12.5px] text-graphite">
                      内部员工标记
                    </div>
                  ) : (
                    <div className="mt-0.5 text-xs text-rust font-medium">
                      有效新客
                    </div>
                  )}
                </td>
                <td className="px-5 py-3.5 border-b border-fog align-middle">
                  <span
                    className={`${badgeBase} ${RECRUIT_BADGE_CLASS.neutral}`}
                  >
                    {lead.main_business_area}
                  </span>
                </td>
                <td className="px-5 py-3.5 border-b border-fog align-middle">
                  <div className="font-medium text-ink whitespace-nowrap">
                    {lead.referrer_name ?? "—"}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-graphite">
                    员工ID: {lead.referrer_employee_id ?? "—"}
                  </div>
                </td>
                <td className="px-5 py-3.5 border-b border-fog align-middle">
                  <span
                    className={`${badgeBase} ${SOURCE_BADGE[lead.source]}`}
                  >
                    {RECRUIT_SOURCE_LABELS[lead.source]}
                  </span>
                </td>
                <td className="px-5 py-3.5 border-b border-fog align-middle">
                  <span
                    className={`${badgeBase} ${LEAD_STATUS_BADGE[lead.status]}`}
                  >
                    {RECRUIT_LEAD_STATUS_LABELS[lead.status]}
                  </span>
                </td>
                <td className="px-5 py-3.5 border-b border-fog align-middle text-[12.5px] text-graphite whitespace-nowrap">
                  {safeFormatDate(lead.created_at, "yyyy-MM-dd HH:mm")}
                </td>
                <td className="px-5 py-3.5 border-b border-fog align-middle">
                  <div className="flex items-center justify-end gap-3">
                    <HasPermission code={PERMISSION_CODES.RECRUIT_WRITE}>
                      <button
                        type="button"
                        disabled={flowingId === lead.id}
                        className="text-[14px] font-medium text-ink px-0.5 hover:opacity-60 transition-opacity disabled:opacity-50 inline-flex items-center gap-1"
                        onClick={() => onFlow(lead.id)}
                      >
                        {flowingId === lead.id && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        )}
                        流转状态
                      </button>
                    </HasPermission>
                    <button
                      type="button"
                      className="text-[14px] font-medium text-ink px-0.5 hover:opacity-60 transition-opacity"
                      onClick={onDetail}
                    >
                      详情
                    </button>
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
