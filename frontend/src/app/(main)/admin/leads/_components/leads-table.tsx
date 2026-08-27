"use client";

import React from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Home, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { isValidUrl } from "@/lib/validators";
import { safeFormatDate } from "@/lib/formatters";
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

interface LeadsTableProps {
  leads: Lead[];
  onOpenDetail: (id: string) => void;
  onEdit: (lead: Lead) => void;
  onDelete: (id: string) => void;
}

/** 格式化日期为 "yyyy-MM-dd"（仅年月日，zh-CN，SSR/CSR 一致，避免 hydration mismatch） */
function formatDateOnly(value?: string): string {
  return safeFormatDate(value, "yyyy-MM-dd");
}

export const LeadsTable: React.FC<LeadsTableProps> = ({
  leads,
  onOpenDetail,
  onEdit,
  onDelete,
}) => {
  return (
    <table className="w-full border-collapse">
      <thead className="border-b border-dove">
        <tr className="text-left text-xs uppercase tracking-wider text-graphite font-normal">
          <th className="p-4 pl-6 lg:pl-4">小区 / 房源信息</th>
          <th className="p-4 pl-6 hidden lg:table-cell">区域</th>
          <th className="p-4 hidden md:table-cell">户型 / 面积</th>
          <th className="p-4 hidden sm:table-cell text-right">总价 / 单价</th>
          <th className="p-4 text-center">状态</th>
          <th className="p-4 hidden xl:table-cell">录入人</th>
          <th className="p-4 hidden xl:table-cell text-right whitespace-nowrap">
            评估价
          </th>
          <th className="p-4 hidden xl:table-cell whitespace-nowrap">创建时间</th>
          <th className="p-4 hidden xl:table-cell whitespace-nowrap">更新时间</th>
          <th className="p-4 pr-6 text-right">操作</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-dove">
        {leads.map((lead) => {
          const config = LEAD_STATUS_META[lead.status];

          return (
            <tr
              key={lead.id}
              className="hover:bg-fog/50 transition-colors group cursor-pointer"
              onClick={() => onOpenDetail(lead.id)}
            >
              {/* 小区 / 房源信息 */}
              <td className="p-4 pl-6 lg:pl-4">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-16 overflow-hidden rounded-md bg-fog border border-dove relative flex items-center justify-center shrink-0">
                    {lead.images && lead.images.length > 0 && isValidUrl(lead.images[0]) ? (
                      <Image
                        src={lead.images[0]}
                        alt={lead.communityName}
                        fill
                        className="object-cover transition-transform group-hover:scale-105"
                        sizes="64px"
                        unoptimized={
                          lead.images[0]?.includes("127.0.0.1") ||
                          lead.images[0]?.includes("localhost")
                        }
                      />
                    ) : (
                      <Home className="h-5 w-5 text-muted-foreground/50" />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium text-ink text-sm truncate max-w-[180px]">
                      {lead.communityName}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono tracking-tight">
                      ID: {lead.id.slice(0, 8)}
                    </span>
                  </div>
                </div>
              </td>

              {/* 区域 */}
              <td className="p-4 pl-6 hidden lg:table-cell">
                <span className="text-sm text-muted-foreground">
                  {lead.district || "-"}
                  {lead.businessArea ? ` · ${lead.businessArea}` : ""}
                </span>
              </td>

              {/* 户型 / 面积 */}
              <td className="p-4 hidden md:table-cell">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-foreground">{lead.layout || "-"}</span>
                  <span className="text-xs text-muted-foreground">
                    {lead.area > 0 ? `${lead.area}㎡` : "-"} · {lead.floorInfo || "-"}
                  </span>
                </div>
              </td>

              {/* 总价 / 单价 */}
              <td className="p-4 hidden sm:table-cell">
                <div className="flex flex-col items-end">
                  <span className="text-sm font-medium text-ink tabular-nums">
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
                  className={cn("px-3 py-1 text-xs", config.badgeClass)}
                >
                  {config.label}
                </Badge>
              </td>

              {/* 录入人 */}
              <td className="p-4 hidden xl:table-cell">
                <span className="text-sm text-muted-foreground bg-fog px-2 py-1 rounded-md">
                  {lead.referrerName || lead.creatorName || "-"}
                </span>
              </td>

              {/* 评估价 */}
              <td className="p-4 hidden xl:table-cell text-right">
                <span className="text-sm font-medium text-foreground tabular-nums">
                  {lead.evalPrice ? `¥${lead.evalPrice}万` : "-"}
                </span>
              </td>

              {/* 创建时间 */}
              <td className="p-4 hidden xl:table-cell">
                <span className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                  {formatDateOnly(lead.createdAt)}
                </span>
              </td>

              {/* 更新时间 */}
              <td className="p-4 hidden xl:table-cell">
                <span className="text-sm text-muted-foreground tabular-nums whitespace-nowrap">
                  {formatDateOnly(lead.updatedAt)}
                </span>
              </td>

              {/* 操作 */}
              <td className="p-4 pr-6 text-right">
                <div
                  className="flex items-center justify-end gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <HasPermission code={PERMISSION_CODES.LEAD_WRITE}>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-graphite hover:text-ink hover:bg-fog h-8 w-8 p-0 rounded-full transition-all"
                      onClick={() => onEdit(lead)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </HasPermission>

                  <HasPermission code={PERMISSION_CODES.LEAD_WRITE}>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-graphite hover:text-error hover:bg-error-container h-8 w-8 p-0 rounded-full transition-all"
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
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
