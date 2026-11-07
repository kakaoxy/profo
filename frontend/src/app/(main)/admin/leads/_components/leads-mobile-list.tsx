"use client";

import React, { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Lead } from "../types";
import { LEAD_STATUS_META } from "../_lib/lead-status-meta";
import { getFollowUpConclusionMeta, getFollowUpMethodShort } from "../_lib/follow-up-meta";
import { cn } from "@/lib/utils";
import { safeFormatDate } from "@/lib/formatters";
import { formatBuildingLabel } from "@/lib/dict-display";

interface LeadsMobileListProps {
  leads: Lead[];
  onOpenDetail: (lead: Lead) => void;
}

const formatPrice = (value?: number | null) =>
  value != null && value > 0 ? value.toLocaleString("zh-CN") : null;

const formatAddress = (lead: Lead) => {
  const building = lead.buildingNo ? formatBuildingLabel(lead.buildingNo) : "";
  const room = lead.roomNo ? `${lead.roomNo}室` : "";
  return [building + (room ? ` ${room}` : ""), lead.district, lead.businessArea]
    .filter(Boolean)
    .join(" · ");
};

/** 390px 移动端：卡片化线索列表，隐藏桌面表格的横向滚动。 */
export const LeadsMobileList: React.FC<LeadsMobileListProps> = ({ leads, onOpenDetail }) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  if (!isMobile) return null;

  return (
  <div className="overflow-hidden rounded-cards bg-pure-white shadow-steep md:hidden">
    {leads.map((lead) => {
      const status = LEAD_STATUS_META[lead.status];
      const conclusion = getFollowUpConclusionMeta(lead.latestFollowUp?.conclusion);
      const price = formatPrice(lead.totalPrice);
      const evalPrice = formatPrice(lead.evalPrice);
      const delta =
        lead.evalPrice != null && lead.totalPrice > 0
          ? ((lead.evalPrice / lead.totalPrice - 1) * 100).toFixed(1)
          : null;
      return (
        <button
          key={lead.id}
          type="button"
          data-testid="lead-mobile-row"
          onClick={() => onOpenDetail(lead)}
          className="w-full border-b border-dove/25 px-4 py-4 text-left transition-colors last:border-b-0 active:bg-fog"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-apricot-wash text-[14px] font-[500] text-rust">
              {lead.communityName.slice(0, 1)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-[500] tracking-[-0.02em] text-ink">
                    {lead.communityName}
                  </div>
                  <div className="mt-1 truncate text-[10px] text-graphite">
                    {formatAddress(lead) || `ID: ${lead.id.slice(0, 8)}`}
                  </div>
                </div>
                <span
                  className={cn(
                    "inline-flex h-[22px] shrink-0 items-center rounded-full px-2 text-[9.5px] font-medium",
                    status.badgeClass,
                  )}
                >
                  {status.label}
                </span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[9.5px] text-dove">业主报价</div>
                  <div className="mt-0.5 text-[19px] font-[480] tracking-[-0.02em] text-ink tabular-nums">
                    {price ?? "价格待录入"}
                    {price ? <small className="ml-0.5 text-[9px] font-normal text-graphite">万</small> : null}
                  </div>
                  <div className="mt-0.5 text-[9px] text-dove">
                    {lead.unitPrice > 0 ? `${lead.unitPrice.toFixed(2)} 万/㎡` : "单价待录入"}
                  </div>
                </div>
                <div className="border-l border-dove/25 pl-3">
                  <div className="text-[9.5px] text-dove">评估价</div>
                  <div className="mt-0.5 text-[15px] font-[480] text-ink tabular-nums">
                    {evalPrice ?? "待评估"}
                    {evalPrice ? <small className="ml-0.5 text-[9px] font-normal text-graphite">万</small> : null}
                  </div>
                  <div className="mt-0.5 text-[9px] text-graphite">
                    {delta ? `${Number(delta) < 0 ? "−" : "+"}${Math.abs(Number(delta)).toFixed(1)}%` : "完成评估后计算"}
                  </div>
                </div>
              </div>

              <div className="mt-3 rounded-[10px] bg-fog px-3 py-2.5">
                <div className="flex items-center gap-1.5">
                  {conclusion ? (
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-medium", conclusion.badgeClass)}>
                      {conclusion.label}
                    </span>
                  ) : (
                    <span className="text-[9.5px] text-dove">未记录</span>
                  )}
                  <span className="text-[9px] text-dove">
                    {lead.latestFollowUp
                      ? `${getFollowUpMethodShort(lead.latestFollowUp.method)} · ${safeFormatDate(
                          lead.latestFollowUp.followedAt,
                          "MM-dd",
                        )}`
                      : "尚未跟进"}
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-[10.5px] leading-[1.55] text-graphite">
                  {lead.latestFollowUp?.content || "还没有跟进记录，先发起一次业主沟通。"}
                </p>
              </div>

              <div className="mt-2 flex items-center justify-between text-[9px] text-dove">
                <span>录入 {safeFormatDate(lead.createdAt, "MM-dd")}</span>
                <span className="inline-flex items-center gap-1 text-graphite">
                  {lead.ownerEmployeeName || "—"}
                  <ChevronRight className="h-3 w-3" />
                </span>
              </div>
            </div>
          </div>
        </button>
      );
    })}
  </div>
  );
};
