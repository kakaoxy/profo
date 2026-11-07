"use client";

import React from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBuildingLabel } from "@/lib/dict-display";
import { isValidUrl } from "@/lib/validators";
import { Lead } from "../types";
import { isClosedWithoutAssessment, LEAD_STATUS_META } from "../_lib/lead-status-meta";
import { getFollowUpConclusionMeta, getFollowUpMethodShort } from "../_lib/follow-up-meta";
import { safeFormatDate } from "@/lib/formatters";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";

interface LeadsGridProps {
  leads: Lead[];
  onOpenDetail: (id: string) => void;
  onDelete: (id: string) => void;
}

const THUMB_CLASS: Record<string, string> = {
  pending_assessment: "bg-apricot-wash text-rust",
  pending_visit: "bg-sky-wash text-ink",
  visited: "bg-fog text-graphite",
  signed: "bg-ink text-white",
  rejected: "bg-fog text-graphite",
  lost_to_competitor: "bg-fog text-rust",
};

/**
 * 列表的卡片视图与表格共用同一套取数口径：
 * 房源识别 → 价格与评估 → 关键参数 → 最近跟进 → 对接人。
 */
export const LeadsGrid: React.FC<LeadsGridProps> = ({ leads, onOpenDetail, onDelete }) => {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {leads.map((lead) => {
        const statusMeta = LEAD_STATUS_META[lead.status];
        const conclusionMeta = getFollowUpConclusionMeta(lead.latestFollowUp?.conclusion);
        const address = [
          lead.buildingNo ? formatBuildingLabel(lead.buildingNo) : "",
          lead.roomNo ? `${lead.roomNo}室` : "",
        ]
          .filter(Boolean)
          .join(" ");
        const location = [lead.district, lead.businessArea].filter(Boolean).join(" · ");
        const hasImage = lead.images && lead.images.length > 0 && isValidUrl(lead.images[0]);

        return (
          <div
            key={lead.id}
            role="button"
            tabIndex={0}
            aria-label={`查看 ${lead.communityName} 线索详情`}
            onClick={() => onOpenDetail(lead.id)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget) {
                e.preventDefault();
                onOpenDetail(lead.id);
              }
            }}
            className="group flex cursor-pointer flex-col gap-3.5 rounded-cards bg-pure-white p-5 text-left shadow-steep-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-steep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
          >
            <div className="flex items-start justify-between gap-2.5">
              <div
                className={cn(
                  "flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[14px] font-display text-[21px] font-[480]",
                  hasImage ? "bg-fog" : THUMB_CLASS[lead.status] || "bg-fog text-graphite",
                )}
              >
                {hasImage ? (
                  <Image
                    src={lead.images[0]}
                    alt=""
                    width={48}
                    height={48}
                    className="h-12 w-12 object-cover"
                    sizes="48px"
                    unoptimized={
                      lead.images[0]?.includes("127.0.0.1") || lead.images[0]?.includes("localhost")
                    }
                  />
                ) : (
                  lead.communityName.charAt(0)
                )}
              </div>
              <div className="flex min-w-0 items-center gap-1.5">
                <Badge
                  variant="secondary"
                  className={cn("px-2.5 py-1 text-[10.5px] font-medium", statusMeta.badgeClass)}
                >
                  {statusMeta.label}
                </Badge>
                <HasPermission code={PERMISSION_CODES.LEAD_WRITE}>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        aria-label={`删除 ${lead.communityName}`}
                        className="hidden h-7 w-7 items-center justify-center rounded-full text-dove transition-colors hover:bg-apricot-wash hover:text-rust group-hover:flex focus-visible:flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink/20"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                      <AlertDialogHeader>
                        <AlertDialogTitle>确认删除线索？</AlertDialogTitle>
                        <AlertDialogDescription>
                          此操作将永久删除该线索，无法恢复。
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>取消</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => onDelete(lead.id)}
                          className="bg-error hover:bg-red-700"
                        >
                          确认删除
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </HasPermission>
              </div>
            </div>

            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <h3 className="truncate text-[17px] font-[480] tracking-[-0.015em] text-ink">
                  {lead.communityName}
                </h3>
                {lead.dictStatus === "pending" ? (
                  <span className="shrink-0 rounded-full bg-apricot-wash px-1.5 py-0.5 text-[9px] font-medium text-rust">
                    未审核
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-[11px] text-graphite">
                {address || `ID: ${lead.id.slice(0, 8)}`}
                {location ? ` · ${location}` : ""}
              </p>
            </div>

            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-baseline gap-1">
                <span className="text-[24px] font-[480] leading-none tracking-[-0.03em] tabular-nums text-ink">
                  {lead.totalPrice > 0 ? lead.totalPrice.toLocaleString("zh-CN") : "—"}
                </span>
                <span className="text-[10px] text-graphite">万</span>
              </div>
              <div className="text-right text-[10px] leading-[1.5] text-graphite">
                评估价
                <b className="block text-[11.5px] font-[450] tabular-nums text-ash">
                  {lead.evalPrice != null
                    ? `${lead.evalPrice.toLocaleString("zh-CN")} 万`
                    : isClosedWithoutAssessment(lead)
                      ? "—"
                      : "待评估"}
                </b>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 border-y border-dove/25 py-2.5">
              <div className="text-[10.5px] leading-[1.4] text-graphite">
                户型
                <b className="mt-px block text-[11.5px] font-[450] text-ink">
                  {lead.layout || "—"}
                </b>
              </div>
              <div className="text-[10.5px] leading-[1.4] text-graphite">
                面积
                <b className="mt-px block text-[11.5px] font-[450] text-ink">
                  {lead.area > 0 ? `${lead.area}㎡` : "—"}
                </b>
              </div>
              <div className="min-w-0 text-[10.5px] leading-[1.4] text-graphite">
                楼层
                <b className="mt-px block truncate text-[11.5px] font-[450] text-ink">
                  {lead.floorInfo || "—"}
                </b>
              </div>
            </div>

            <div className="flex min-h-9 items-start gap-1.5">
              <Badge
                variant="secondary"
                className={cn(
                  "h-[18px] shrink-0 px-2 py-0 text-[9.5px] font-medium",
                  conclusionMeta.badgeClass,
                )}
              >
                {conclusionMeta.label}
              </Badge>
              <p
                title={lead.latestFollowUp?.content}
                className="line-clamp-2 text-[11px] leading-[1.45] text-ash"
              >
                {lead.latestFollowUp?.content || "尚未跟进"}
              </p>
            </div>

            <div className="mt-px flex items-center justify-between gap-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex h-[25px] w-[25px] shrink-0 items-center justify-center rounded-full bg-fog text-[10px] font-medium text-graphite">
                  {(lead.ownerEmployeeName || "—").charAt(0)}
                </span>
                <span className="flex min-w-0 flex-col leading-[1.35]">
                  <span className="truncate text-[11px] font-[450] text-ink">
                    {lead.ownerEmployeeName || "—"}
                  </span>
                  <span className="truncate text-[9px] text-dove">{lead.storeName || "—"}</span>
                </span>
              </div>
              <span className="shrink-0 text-[9.5px] tabular-nums text-dove">
                {lead.latestFollowUp
                  ? `${safeFormatDate(lead.latestFollowUp.followedAt, "MM-dd")} · ${getFollowUpMethodShort(lead.latestFollowUp.method)}`
                  : "—"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
