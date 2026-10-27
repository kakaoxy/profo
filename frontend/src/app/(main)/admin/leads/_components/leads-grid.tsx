"use client";

import React from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Home, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { isValidUrl } from "@/lib/validators";
import { Lead } from "../types";
import { LEAD_STATUS_META } from "../_lib/lead-status-meta";
import { getFollowUpConclusionMeta } from "../_lib/follow-up-meta";
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

export const LeadsGrid: React.FC<LeadsGridProps> = ({ leads, onOpenDetail, onDelete }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {leads.map((lead) => {
        const config = LEAD_STATUS_META[lead.status];

        return (
          <Card
            key={lead.id}
            className="overflow-hidden border-none bg-white rounded-cards shadow-steep-sm hover:-translate-y-0.5 hover:shadow-steep transition-all duration-200 cursor-pointer group"
            onClick={() => onOpenDetail(lead.id)}
          >
            {/* Image Area */}
            <div className="relative aspect-4/3 flex items-center justify-center bg-fog overflow-hidden">
              {lead.images && lead.images.length > 0 && isValidUrl(lead.images[0]) ? (
                <Image
                  src={lead.images[0]}
                  alt={lead.communityName}
                  fill
                  className="object-cover rounded-[12px] transition-transform group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  unoptimized={
                    lead.images[0]?.includes("127.0.0.1") || lead.images[0]?.includes("localhost")
                  }
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-graphite/30">
                  <Home className="h-10 w-10" />
                </div>
              )}

              {/* Status Badge */}
              <div className="absolute top-3 left-3">
                <Badge className={cn("text-xs px-2.5 py-1", config.badgeClass)}>
                  {config.label}
                </Badge>
              </div>

              {/* Action Buttons */}
              <div
                className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <HasPermission code={PERMISSION_CODES.LEAD_WRITE}>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 bg-pure-white/90 backdrop-blur-sm rounded-full text-graphite hover:text-error hover:bg-error-container"
                        aria-label="删除线索"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
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

            {/* Content Area */}
            <div className="p-4">
              {/* Title & Location */}
              <div className="mb-3">
                <div className="flex items-center gap-1.5">
                  <h3 className="font-medium text-ink text-base line-clamp-1">
                    {lead.communityName}
                  </h3>
                  {lead.dictStatus === "pending" ? (
                    <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                      未审核
                    </span>
                  ) : null}
                </div>
                {/* 字典地址行（surface-dict-binding-info）：楼栋/户室缺失静默省略 */}
                {lead.buildingNo || lead.roomNo ? (
                  <p className="text-xs text-ink mt-1">
                    {[lead.buildingNo && `${lead.buildingNo}栋`, lead.roomNo && `${lead.roomNo}室`]
                      .filter(Boolean)
                      .join(" ")}
                  </p>
                ) : null}
                <div className="flex items-center gap-1 text-xs text-graphite mt-1">
                  <MapPin className="h-3 w-3" />
                  <span className="line-clamp-1">
                    {lead.district || "-"}
                    {lead.businessArea ? ` · ${lead.businessArea}` : ""}
                  </span>
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-fog rounded-inputs p-2">
                  <span className="text-[10px] text-graphite/60 uppercase tracking-wider block mb-0.5">
                    户型
                  </span>
                  <span className="text-sm font-medium text-ink">{lead.layout || "-"}</span>
                </div>
                <div className="bg-fog rounded-inputs p-2">
                  <span className="text-[10px] text-graphite/60 uppercase tracking-wider block mb-0.5">
                    面积
                  </span>
                  <span className="text-sm font-medium text-ink">
                    {lead.area > 0 ? `${lead.area}㎡` : "-"}
                  </span>
                </div>
              </div>

              {/* Price & Floor */}
              <div className="flex items-end justify-between pt-3 border-t border-dove">
                <div>
                  <span className="text-[10px] text-graphite/60 uppercase tracking-wider block mb-0.5">
                    总价
                  </span>
                  <span className="text-lg font-medium text-ink tabular-nums">
                    {lead.totalPrice > 0 ? `¥${lead.totalPrice}万` : "-"}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-graphite">{lead.floorInfo || "-"}</span>
                  {lead.unitPrice > 0 && (
                    <span className="text-xs text-graphite/60 block tabular-nums">
                      {lead.unitPrice.toFixed(2)}万/㎡
                    </span>
                  )}
                </div>
              </div>

              {/* 跟进摘要（设计稿②增量：卡片视图与表格取数口径一致） */}
              <div className="mt-3 border-t border-dove pt-3">
                <div className="mb-1.5">
                  <Badge
                    variant="secondary"
                    className={cn(
                      "px-2.5 py-0.5 text-[11.5px]",
                      getFollowUpConclusionMeta(lead.latestFollowUp?.conclusion).badgeClass,
                    )}
                  >
                    {getFollowUpConclusionMeta(lead.latestFollowUp?.conclusion).label}
                  </Badge>
                </div>
                {lead.latestFollowUp ? (
                  <>
                    <p
                      title={lead.latestFollowUp.content}
                      className="line-clamp-2 text-xs leading-relaxed text-ash"
                    >
                      {lead.latestFollowUp.content}
                    </p>
                    <p className="mt-1 text-[11px] tabular-nums text-dove">
                      {safeFormatDate(lead.latestFollowUp.followedAt, "MM-dd")} ·{" "}
                      {lead.latestFollowUp.createdByName || "—"}
                    </p>
                  </>
                ) : (
                  <p className="text-xs leading-relaxed text-dove">尚未跟进</p>
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};
