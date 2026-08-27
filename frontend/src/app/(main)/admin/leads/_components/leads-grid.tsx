"use client";

import React from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Home, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { isValidUrl } from "@/lib/validators";
import { Lead } from "../types";
import { LEAD_STATUS_META } from "../_lib/lead-status-meta";
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
  onEdit: (lead: Lead) => void;
  onDelete: (id: string) => void;
}

export const LeadsGrid: React.FC<LeadsGridProps> = ({ leads, onOpenDetail, onEdit, onDelete }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {leads.map((lead) => {
        const config = LEAD_STATUS_META[lead.status];

        return (
          <Card
            key={lead.id}
            className="overflow-hidden border-none bg-pure-white rounded-cards shadow-steep-sm hover:-translate-y-0.5 hover:shadow-steep transition-all duration-200 cursor-pointer group"
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
                <div className="flex flex-col items-center gap-2 text-muted-foreground/30">
                  <Home className="h-10 w-10" />
                </div>
              )}

              {/* Status Badge */}
              <div className="absolute top-3 left-3">
                <Badge
                  className={cn("text-xs px-2.5 py-1", config.badgeClass)}
                >
                  {config.label}
                </Badge>
              </div>

              {/* Action Buttons */}
              <div
                className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <HasPermission code={PERMISSION_CODES.LEAD_WRITE}>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 bg-pure-white/90 backdrop-blur-sm rounded-full shadow-sm text-graphite hover:text-ink hover:bg-fog"
                    onClick={() => onEdit(lead)}
                    aria-label="编辑线索"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </HasPermission>

                <HasPermission code={PERMISSION_CODES.LEAD_WRITE}>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 bg-pure-white/90 backdrop-blur-sm rounded-full shadow-sm text-graphite hover:text-error hover:bg-error-container"
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
                <h3 className="font-medium text-ink text-base line-clamp-1">
                  {lead.communityName}
                </h3>
                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                  <MapPin className="h-3 w-3" />
                  <span className="line-clamp-1">
                    {lead.district || "-"}
                    {lead.businessArea ? ` · ${lead.businessArea}` : ""}
                  </span>
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-fog rounded-md p-2">
                  <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider block mb-0.5">
                    户型
                  </span>
                  <span className="text-sm font-medium text-foreground">{lead.layout || "-"}</span>
                </div>
                <div className="bg-fog rounded-md p-2">
                  <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider block mb-0.5">
                    面积
                  </span>
                  <span className="text-sm font-medium text-foreground">
                    {lead.area > 0 ? `${lead.area}㎡` : "-"}
                  </span>
                </div>
              </div>

              {/* Price & Floor */}
              <div className="flex items-end justify-between pt-3 border-t border-dove">
                <div>
                  <span className="text-[10px] text-muted-foreground/60 uppercase tracking-wider block mb-0.5">
                    总价
                  </span>
                  <span className="text-lg font-medium text-ink tabular-nums">
                    {lead.totalPrice > 0 ? `¥${lead.totalPrice}万` : "-"}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-muted-foreground">{lead.floorInfo || "-"}</span>
                  {lead.unitPrice > 0 && (
                    <span className="text-xs text-muted-foreground/60 block tabular-nums">
                      {lead.unitPrice.toFixed(2)}万/㎡
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
};
