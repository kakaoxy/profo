"use client";

import React from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Home, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Lead } from "../types";
import { getStatusStyleConfig } from "@/lib/status-colors";
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

interface LeadsTableProps {
  leads: Lead[];
  onOpenDetail: (id: string) => void;
  onEdit: (lead: Lead) => void;
  onDelete: (id: string) => void;
}



export const LeadsTable: React.FC<LeadsTableProps> = ({
  leads,
  onOpenDetail,
  onEdit,
  onDelete,
}) => {
  return (
    <table className="w-full border-collapse">
      <thead className="bg-muted border-b border-border">
        <tr className="text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <th className="p-4 pl-6 font-medium">小区 / 房源信息</th>
          <th className="p-4 hidden md:table-cell font-medium">户型 / 面积</th>
          <th className="p-4 hidden sm:table-cell font-medium text-right">总价 / 单价</th>
          <th className="p-4 text-center font-medium">状态</th>
          <th className="p-4 hidden lg:table-cell font-medium">区域</th>
          <th className="p-4 hidden xl:table-cell font-medium">录入人</th>
          <th className="p-4 pr-6 text-right font-medium">操作</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {leads.map((lead) => {
          const config = getStatusStyleConfig(lead.status);

          return (
            <tr
              key={lead.id}
              className="hover:bg-muted transition-colors group cursor-pointer"
              onClick={() => onOpenDetail(lead.id)}
            >
              {/* 小区 / 房源信息 */}
              <td className="p-4 pl-6">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-16 overflow-hidden rounded-md bg-muted border border-border relative flex items-center justify-center shrink-0">
                    {lead.images && lead.images.length > 0 ? (
                      <Image
                        src={lead.images[0]}
                        alt={lead.communityName}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                        sizes="64px"
                        unoptimized={true}
                      />
                    ) : (
                      <Home className="h-5 w-5 text-muted-foreground/50" />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-semibold text-foreground text-sm truncate max-w-[180px] group-hover:text-primary transition-colors">
                      {lead.communityName}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono tracking-tight">
                      ID: {lead.id.slice(0, 8)}
                    </span>
                  </div>
                </div>
              </td>

              {/* 户型 / 面积 */}
              <td className="p-4 hidden md:table-cell">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">
                    {lead.layout || "-"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {lead.area > 0 ? `${lead.area}㎡` : "-"} · {lead.floorInfo || "-"}
                  </span>
                </div>
              </td>

              {/* 总价 / 单价 */}
              <td className="p-4 hidden sm:table-cell">
                <div className="flex flex-col items-end">
                  <span className="text-sm font-bold text-foreground tabular-nums">
                    {lead.totalPrice > 0 ? `¥${lead.totalPrice}万` : "-"}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {lead.unitPrice > 0 ? `${lead.unitPrice.toFixed(2)}万/㎡` : "-"}
                  </span>
                </div>
              </td>

              {/* 状态 */}
              <td className="p-4 text-center">
                <Badge
                  variant="secondary"
                  className={cn(
                    "px-3 py-1 text-xs font-semibold rounded-lg border-none shadow-none",
                    config.className
                  )}
                >
                  {config.label}
                </Badge>
              </td>

              {/* 区域 */}
              <td className="p-4 hidden lg:table-cell">
                <span className="text-sm text-muted-foreground">
                  {lead.district || "-"}
                  {lead.businessArea ? ` · ${lead.businessArea}` : ""}
                </span>
              </td>

              {/* 录入人 */}
              <td className="p-4 hidden xl:table-cell">
                <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded-md">
                  {lead.creatorName || "-"}
                </span>
              </td>

              {/* 操作 */}
              <td className="p-4 pr-6 text-right">
                <div
                  className="flex items-center justify-end gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-primary hover:bg-primary/10 h-8 w-8 p-0 rounded-full transition-all"
                    onClick={() => onEdit(lead)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-error hover:bg-error-container h-8 w-8 p-0 rounded-full transition-all"
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
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
