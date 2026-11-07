"use client";

import React from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBuildingLabel } from "@/lib/dict-display";
import { isValidUrl } from "@/lib/validators";
import { safeFormatDate } from "@/lib/formatters";
import { Lead } from "../types";
import { isClosedWithoutAssessment, LEAD_STATUS_META } from "../_lib/lead-status-meta";
import { getFollowUpConclusionMeta, getFollowUpMethodShort } from "../_lib/follow-up-meta";
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

interface LeadsTableProps {
  leads: Lead[];
  onOpenDetail: (id: string) => void;
  onDelete: (id: string) => void;
}

const GRID_COLUMNS = "grid-cols-[minmax(0,1.32fr)_176px_96px_minmax(0,1.05fr)_128px_52px]";

const THUMB_CLASS: Record<string, string> = {
  pending_assessment: "bg-apricot-wash text-rust",
  pending_visit: "bg-sky-wash text-ink",
  visited: "bg-fog text-graphite",
  signed: "bg-ink text-white",
  rejected: "bg-fog text-graphite",
  lost_to_competitor: "bg-fog text-rust",
};

/**
 * 线索列表：把原来 12 个碎列收成 6 个阅读单元。
 * 房源是第一阅读入口；价格与评估放在同一列比较；跟进结论和最近内容合并为
 * 一次扫描；对接人和箭头只承担「找谁 / 打开」。
 */
export const LeadsTable: React.FC<LeadsTableProps> = ({ leads, onOpenDetail, onDelete }) => {
  return (
    <div className="min-w-[1080px]">
      <div
        data-testid="lead-table-header"
        className={cn(
          "grid h-[42px] items-center gap-5 border-b border-dove/30 px-6 text-[10.5px] font-medium tracking-[0.02em] text-dove",
          GRID_COLUMNS,
        )}
      >
        <span>房源</span>
        <span>价格 / 评估</span>
        <span>状态</span>
        <span>最近跟进</span>
        <span>对接人</span>
        <span className="sr-only">操作</span>
      </div>

      <div className="divide-y divide-dove/20">
        {leads.map((lead) => {
          const statusMeta = LEAD_STATUS_META[lead.status];
          const conclusionMeta = getFollowUpConclusionMeta(lead.latestFollowUp?.conclusion);
          const fu = lead.latestFollowUp ?? null;
          const evalUnitPrice =
            lead.evalPrice != null && lead.area > 0
              ? (lead.evalPrice / lead.area).toFixed(2)
              : null;
          const deltaPct =
            lead.evalPrice != null && lead.totalPrice > 0
              ? (lead.evalPrice / lead.totalPrice - 1) * 100
              : null;
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
              data-testid="lead-row"
              aria-label={`打开 ${lead.communityName} 线索详情`}
              className={cn(
                "group grid min-h-[86px] cursor-pointer items-center gap-5 px-6 py-4 text-left transition-colors hover:bg-[#fbfbfc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink/20",
                GRID_COLUMNS,
              )}
              onClick={() => onOpenDetail(lead.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  if (e.target === e.currentTarget) {
                    e.preventDefault();
                    onOpenDetail(lead.id);
                  }
                }
              }}
            >
              <div className="flex min-w-0 items-start gap-3.5">
                <div
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[12px] font-display text-[18px] font-[480] transition-colors",
                    hasImage ? "bg-fog" : THUMB_CLASS[lead.status] || "bg-fog text-graphite",
                  )}
                >
                  {hasImage ? (
                    <Image
                      src={lead.images[0]}
                      alt=""
                      width={44}
                      height={44}
                      className="h-11 w-11 object-cover"
                      sizes="44px"
                      unoptimized={
                        lead.images[0]?.includes("127.0.0.1") ||
                        lead.images[0]?.includes("localhost")
                      }
                    />
                  ) : (
                    lead.communityName.charAt(0)
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[14px] font-medium leading-[1.35] text-ink">
                      {lead.communityName}
                    </span>
                    {lead.dictStatus === "pending" ? (
                      <span className="shrink-0 rounded-full bg-apricot-wash px-1.5 py-0.5 text-[9px] font-medium text-rust">
                        未审核
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-graphite">
                    {address || `ID: ${lead.id.slice(0, 8)}`}
                    {location ? ` · ${location}` : ""}
                  </div>
                  <div className="mt-0.5 truncate text-[10.5px] tabular-nums text-dove">
                    {lead.layout || "—"} · {lead.area > 0 ? `${lead.area}㎡` : "—"} ·{" "}
                    {lead.floorInfo || "—"}
                  </div>
                </div>
              </div>

              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex items-baseline gap-1 whitespace-nowrap">
                  <span className="text-[16.5px] font-[480] tracking-[-0.02em] tabular-nums text-ink">
                    {lead.totalPrice > 0 ? lead.totalPrice.toLocaleString("zh-CN") : "—"}
                  </span>
                  <span className="text-[10px] text-graphite">万</span>
                  <span className="ml-1 text-[10px] tabular-nums text-dove">
                    {lead.unitPrice > 0 ? `${lead.unitPrice.toFixed(2)} 万/㎡` : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 whitespace-nowrap text-[10.5px] text-graphite">
                  <span>评估</span>
                  {lead.evalPrice != null ? (
                    <>
                      <span className="font-medium tabular-nums text-ash">
                        {lead.evalPrice.toLocaleString("zh-CN")} 万
                      </span>
                      {evalUnitPrice ? (
                        <span className="text-dove">/ {evalUnitPrice} 万/㎡</span>
                      ) : null}
                      {deltaPct != null ? (
                        <span
                          className={cn(
                            "font-medium tabular-nums",
                            deltaPct < 0 ? "text-rust" : "text-graphite",
                          )}
                        >
                          {deltaPct > 0 ? "+" : ""}
                          {deltaPct.toFixed(1)}%
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="text-dove">
                      {isClosedWithoutAssessment(lead) ? "—" : "待评估"}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <Badge
                  variant="secondary"
                  className={cn("px-2.5 py-1 text-[10.5px] font-medium", statusMeta.badgeClass)}
                >
                  {statusMeta.label}
                </Badge>
              </div>

              <div className="min-w-0">
                {fu ? (
                  <>
                    <div className="flex min-w-0 items-center gap-1.5">
                      <Badge
                        variant="secondary"
                        className={cn(
                          "h-[18px] shrink-0 px-2 py-0 text-[9.5px] font-medium",
                          conclusionMeta.badgeClass,
                        )}
                      >
                        {conclusionMeta.label}
                      </Badge>
                      <span className="truncate text-[9.5px] tabular-nums text-dove">
                        {getFollowUpMethodShort(fu.method)} ·{" "}
                        {safeFormatDate(fu.followedAt, "MM-dd")}
                      </span>
                    </div>
                    <p
                      title={fu.content}
                      className="mt-1 line-clamp-2 text-[11px] leading-[1.45] text-ash"
                    >
                      {fu.content}
                    </p>
                    <p className="mt-0.5 truncate text-[9.5px] text-dove">
                      {fu.createdByName || "—"}
                    </p>
                  </>
                ) : (
                  <>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "h-[18px] px-2 py-0 text-[9.5px] font-medium",
                        conclusionMeta.badgeClass,
                      )}
                    >
                      {conclusionMeta.label}
                    </Badge>
                    <p className="mt-1 text-[11px] leading-[1.45] text-dove">尚未跟进</p>
                  </>
                )}
              </div>

              <div data-testid="lead-row-owner" className="flex min-w-0 items-center gap-2">
                <span className="flex h-[25px] w-[25px] shrink-0 items-center justify-center rounded-full bg-fog text-[10px] font-medium text-graphite">
                  {(lead.ownerEmployeeName || "—").charAt(0)}
                </span>
                <span className="flex min-w-0 flex-col leading-[1.35]">
                  <span
                    data-testid="lead-owner-name"
                    className="truncate text-[11.5px] font-[450] text-ink"
                  >
                    {lead.ownerEmployeeName || "—"}
                  </span>
                  <span className="truncate text-[9.5px] text-dove">{lead.storeName || "—"}</span>
                </span>
              </div>

              <div className="flex items-center justify-end gap-0.5">
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
                <ChevronRight className="h-[15px] w-[15px] text-dove transition-all group-hover:translate-x-px group-hover:text-ink" />
              </div>
              <span className="sr-only">录入人 {lead.creatorName || "—"}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
