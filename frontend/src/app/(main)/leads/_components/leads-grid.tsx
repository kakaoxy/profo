"use client";

import React from "react";
import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Home, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Lead, LeadStatus } from "../types";
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

interface LeadsGridProps {
  leads: Lead[];
  onOpenDetail: (id: string) => void;
  onEdit: (lead: Lead) => void;
  onDelete: (id: string) => void;
}

// 状态配置 - 与 projects 保持一致的无边框纯色风格
const statusConfig: Record<string, { label: string; className: string }> = {
  pending_assessment: {
    label: "待评估",
    className: "bg-blue-500 text-white",
  },
  pending_visit: {
    label: "待看房",
    className: "bg-orange-500 text-white",
  },
  visited: {
    label: "已看房",
    className: "bg-emerald-500 text-white",
  },
  signed: {
    label: "已签约",
    className: "bg-indigo-500 text-white",
  },
  rejected: {
    label: "已驳回",
    className: "bg-slate-300 text-slate-700",
  },
};

export const LeadsGrid: React.FC<LeadsGridProps> = ({
  leads,
  onOpenDetail,
  onEdit,
  onDelete,
}) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {leads.map((lead) => {
        const config = statusConfig[lead.status] || {
          label: lead.status,
          className: "bg-slate-100 text-slate-600",
        };

        return (
          <Card
            key={lead.id}
            className="overflow-hidden border border-slate-200 shadow-sm hover:shadow-md transition-all cursor-pointer group bg-white"
            onClick={() => onOpenDetail(lead.id)}
          >
            {/* Image Area */}
            <div className="relative aspect-[4/3] flex items-center justify-center bg-slate-100 overflow-hidden">
              {lead.images && lead.images.length > 0 ? (
                <Image
                  src={lead.images[0]}
                  alt={lead.communityName}
                  fill
                  className="object-cover transition-transform group-hover:scale-105"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  unoptimized={
                    lead.images[0]?.includes("127.0.0.1") ||
                    lead.images[0]?.includes("localhost")
                  }
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-300">
                  <Home className="h-10 w-10" />
                </div>
              )}

              {/* Status Badge */}
              <div className="absolute top-3 left-3">
                <Badge
                  className={cn(
                    "font-semibold text-xs border-none shadow-sm px-2.5 py-1",
                    config.className
                  )}
                >
                  {config.label}
                </Badge>
              </div>

              {/* Action Buttons */}
              <div
                className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => e.stopPropagation()}
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 bg-white/90 backdrop-blur-sm hover:bg-white rounded-full shadow-sm text-slate-600 hover:text-blue-600"
                  onClick={() => onEdit(lead)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 bg-white/90 backdrop-blur-sm hover:bg-white rounded-full shadow-sm text-slate-600 hover:text-red-600"
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
                        className="bg-red-600 hover:bg-red-700"
                      >
                        确认删除
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            {/* Content Area */}
            <div className="p-4">
              {/* Title & Location */}
              <div className="mb-3">
                <h3 className="font-semibold text-slate-900 text-base line-clamp-1 group-hover:text-blue-600 transition-colors">
                  {lead.communityName}
                </h3>
                <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                  <MapPin className="h-3 w-3" />
                  <span className="line-clamp-1">
                    {lead.district || "-"}
                    {lead.businessArea ? ` · ${lead.businessArea}` : ""}
                  </span>
                </div>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-slate-50 rounded-md p-2">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5">
                    户型
                  </span>
                  <span className="text-sm font-medium text-slate-700">
                    {lead.layout || "-"}
                  </span>
                </div>
                <div className="bg-slate-50 rounded-md p-2">
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5">
                    面积
                  </span>
                  <span className="text-sm font-medium text-slate-700">
                    {lead.area > 0 ? `${lead.area}㎡` : "-"}
                  </span>
                </div>
              </div>

              {/* Price & Floor */}
              <div className="flex items-end justify-between pt-3 border-t border-slate-100">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-wider block mb-0.5">
                    总价
                  </span>
                  <span className="text-lg font-bold text-slate-900 tabular-nums">
                    {lead.totalPrice > 0 ? `¥${lead.totalPrice}万` : "-"}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-500">
                    {lead.floorInfo || "-"}
                  </span>
                  {lead.unitPrice > 0 && (
                    <span className="text-xs text-slate-400 block tabular-nums">
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
