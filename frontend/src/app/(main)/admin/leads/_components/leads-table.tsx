"use client";

import React from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBuildingLabel } from "@/lib/dict-display";
import { isValidUrl } from "@/lib/validators";
import { safeFormatDate } from "@/lib/formatters";
import { Lead } from "../types";
import { LEAD_STATUS_META } from "../_lib/lead-status-meta";
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

/**
 * 线索列表 11 列（docs/design/线索跟进列表-线索中心迭代-hifi.html ①②③）：
 * ① 评估价前移 + 评估单价（= 评估价 ÷ 面积，前端派生，后端不新增列）；
 * ② 创建/更新合并为一列上下两行；
 * ③ 状态与录入人之间插入「跟进结论 / 最后一条跟进内容」（最近一条，取数口径见后端
 *    LeadQueryService.get_latest_follow_ups）。
 * 列宽用 table-fixed + th 宽度类（不用 colgroup：断点隐藏 th 后剩余列按宽度类重排，
 * colgroup 会错位）；容器 overflow-x-auto，窄屏横向滚动不挤压文字列。
 * 「最后一条跟进内容」为唯一弹性列：table-fixed 只认首行 width、忽略 min-width，
 * 故表格 min-width = 固定列合计 1090 + 弹性列最小 134 = 1224px（设计稿规格「弹性，≥134」），
 * 保证视口 1180–1280px 时弹性列不倅于固定列压瘪（否则与录入人间出现大空白）。
 * 录入人列 96px 偶离设计稿的 80px：真实姓名多为 3 字（刘希锋），80px 下内容
 * 溢出 padding、与创建/更新列间隙压到 11px，尾部节奏与前段 20px 不一致（SPEC R7）。
 */
export const LeadsTable: React.FC<LeadsTableProps> = ({ leads, onOpenDetail, onDelete }) => {
  return (
    <table className="w-full min-w-[1224px] table-fixed border-collapse">
      <thead className="border-b border-dove">
        <tr className="text-left align-bottom text-[12.5px] font-medium tracking-wide text-graphite">
          <th className="w-[196px] whitespace-nowrap px-2.5 py-3 pl-5 font-medium">小区 / 房源</th>
          <th className="hidden w-[84px] whitespace-nowrap px-2.5 py-3 font-medium lg:table-cell">
            区域
          </th>
          <th className="w-[120px] whitespace-nowrap px-2.5 py-3 font-medium">户型 / 楼层</th>
          <th className="w-[102px] whitespace-nowrap px-2.5 py-3 text-right font-medium">
            业主报价 / 单价
            <span className="mt-0.5 block text-[11px] font-normal text-dove">万 · 万/㎡</span>
          </th>
          <th className="w-[102px] whitespace-nowrap px-2.5 py-3 text-right font-medium">
            评估价 / 单价
            <span className="mt-0.5 block text-[11px] font-normal text-dove">万 · 万/㎡</span>
          </th>
          <th className="w-[82px] whitespace-nowrap px-2.5 py-3 font-medium">状态</th>
          <th className="hidden w-[142px] whitespace-nowrap px-2.5 py-3 font-medium md:table-cell">
            跟进结论
          </th>
          <th className="hidden whitespace-nowrap px-2.5 py-3 font-medium md:table-cell">
            最后一条跟进内容
          </th>
          <th className="hidden w-[96px] whitespace-nowrap px-2.5 py-3 font-medium xl:table-cell">
            录入人
          </th>
          <th className="hidden w-[88px] whitespace-nowrap px-2.5 py-3 font-medium xl:table-cell">
            创建 / 更新
          </th>
          <th className="w-[78px] whitespace-nowrap px-2.5 py-3 pr-4 text-right font-medium">
            操作
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-dove/30">
        {leads.map((lead) => {
          const config = LEAD_STATUS_META[lead.status];
          const conclusionMeta = getFollowUpConclusionMeta(lead.latestFollowUp?.conclusion);
          const fu = lead.latestFollowUp ?? null;
          // 单价派生：评估价 ÷ 面积（两者均有效才算，保留 2 位；缺失显示 —，不猜）
          const evalUnitPrice =
            lead.evalPrice != null && lead.area > 0
              ? (lead.evalPrice / lead.area).toFixed(2)
              : null;

          return (
            <tr
              key={lead.id}
              tabIndex={0}
              aria-label={`打开 ${lead.communityName} 线索详情`}
              className="cursor-pointer transition-colors hover:bg-fog focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-rust"
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
              {/* 小区 / 房源 */}
              <td className="whitespace-nowrap px-2.5 py-2.5 pl-5 align-middle">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-11 shrink-0 items-center justify-center rounded-[9px] bg-fog shadow-[inset_0_0_0_1px_rgba(163,166,175,0.18)]">
                    {lead.images && lead.images.length > 0 && isValidUrl(lead.images[0]) ? (
                      <Image
                        src={lead.images[0]}
                        alt={lead.communityName}
                        width={44}
                        height={36}
                        className="h-9 w-11 rounded-[9px] object-cover"
                        sizes="44px"
                        unoptimized={
                          lead.images[0]?.includes("127.0.0.1") ||
                          lead.images[0]?.includes("localhost")
                        }
                      />
                    ) : (
                      <Home className="h-3.5 w-3.5 text-dove" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="block truncate max-w-[120px] text-sm font-medium leading-tight text-ink">
                        {lead.communityName}
                      </span>
                      {lead.dictStatus === "pending" ? (
                        <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                          未审核
                        </span>
                      ) : null}
                    </div>
                    {/* 字典地址行（surface-dict-binding-info）：楼栋/户室缺失静默回退 ID */}
                    {lead.buildingNo || lead.roomNo ? (
                      <span className="mt-0.5 block truncate max-w-[120px] text-xs leading-tight text-graphite">
                        {[
                          lead.buildingNo && formatBuildingLabel(lead.buildingNo),
                          lead.roomNo && `${lead.roomNo}室`,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      </span>
                    ) : (
                      <span className="mt-0.5 block truncate max-w-[120px] font-mono text-xs leading-tight text-graphite">
                        ID: {lead.id.slice(0, 8)}
                      </span>
                    )}
                  </div>
                </div>
              </td>

              {/* 区域 */}
              <td className="hidden whitespace-nowrap px-2.5 py-2.5 align-middle lg:table-cell">
                <span className="block text-[13px] leading-tight text-ash">
                  {lead.district || "—"}
                </span>
                <span className="mt-0.5 block text-xs leading-tight text-graphite">
                  {lead.businessArea || "—"}
                </span>
              </td>

              {/* 户型 / 楼层 */}
              <td className="whitespace-nowrap px-2.5 py-2.5 align-middle">
                <span className="block text-[13.5px] font-normal leading-tight text-ink">
                  {lead.layout || "—"}
                </span>
                <span className="mt-0.5 block truncate text-xs tabular-nums leading-tight text-graphite">
                  {lead.area > 0 ? `${lead.area}㎡` : "—"} · {lead.floorInfo || "—"}
                </span>
              </td>

              {/* 业主报价 / 单价 */}
              <td className="whitespace-nowrap px-2.5 py-2.5 text-right align-middle">
                <span className="block text-sm font-medium tabular-nums leading-tight text-ink">
                  {lead.totalPrice > 0 ? lead.totalPrice.toLocaleString("zh-CN") : "—"}
                </span>
                <span className="mt-0.5 block text-xs tabular-nums leading-tight text-graphite">
                  {lead.unitPrice > 0 ? `${lead.unitPrice.toFixed(2)} 万/㎡` : "—"}
                </span>
              </td>

              {/* 评估价 / 单价（①前移 + 评估单价） */}
              <td className="whitespace-nowrap px-2.5 py-2.5 text-right align-middle">
                <span className="block text-sm font-medium tabular-nums leading-tight text-ink">
                  {lead.evalPrice != null ? lead.evalPrice.toLocaleString("zh-CN") : "—"}
                </span>
                <span className="mt-0.5 block text-xs tabular-nums leading-tight text-graphite">
                  {evalUnitPrice != null ? `${evalUnitPrice} 万/㎡` : "—"}
                </span>
              </td>

              {/* 状态 */}
              <td className="whitespace-nowrap px-2.5 py-2.5 align-middle">
                <Badge
                  variant="secondary"
                  className={cn("px-2.5 py-0.5 text-xs", config.badgeClass)}
                >
                  {config.label}
                </Badge>
              </td>

              {/* 跟进结论（③） */}
              <td className="hidden whitespace-nowrap px-2.5 py-2.5 align-middle md:table-cell">
                <Badge
                  variant="secondary"
                  className={cn("px-2.5 py-0.5 text-[11.5px]", conclusionMeta.badgeClass)}
                >
                  {conclusionMeta.label}
                </Badge>
              </td>

              {/* 最后一条跟进内容（③）：正文 2 行截断 + title 全文；无跟进不伪造 */}
              <td className="hidden px-2.5 py-2.5 align-middle md:table-cell">
                {fu ? (
                  <>
                    <p
                      title={fu.content}
                      className="line-clamp-2 whitespace-normal text-[12.5px] leading-normal text-ash"
                    >
                      {fu.content}
                    </p>
                    <p className="mt-0.5 text-[11px] tabular-nums text-dove">
                      {safeFormatDate(fu.followedAt, "MM-dd")} · {fu.createdByName || "—"} ·{" "}
                      {getFollowUpMethodShort(fu.method)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="min-h-[38px] text-[12.5px] leading-normal text-dove">—</p>
                    <p className="mt-0.5 text-[11px] text-dove">尚未跟进</p>
                  </>
                )}
              </td>

              {/* 录入人 */}
              <td className="hidden whitespace-nowrap px-2.5 py-2.5 align-middle xl:table-cell">
                <span className="inline-flex items-center gap-1.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-fog text-[11px] font-medium text-ink">
                    {(lead.referrerName || lead.creatorName || "—").charAt(0)}
                  </span>
                  <span className="block truncate max-w-[56px] text-[13px] text-ash">
                    {lead.referrerName || lead.creatorName || "—"}
                  </span>
                </span>
              </td>

              {/* 创建 / 更新（②合并一列）：年内 MM-DD，跨年 YYYY-MM-DD，title 恒为完整时间 */}
              <td className="hidden whitespace-nowrap px-2.5 py-2.5 align-middle xl:table-cell">
                <div className="flex flex-col gap-0.5">
                  <span className="flex items-baseline gap-1 text-xs leading-tight text-ash">
                    <span className="text-[10.5px] tracking-wide text-dove">创建</span>
                    <span
                      className="tabular-nums"
                      title={`创建 ${safeFormatDate(lead.createdAt, "yyyy-MM-dd HH:mm")}`}
                    >
                      {safeFormatDate(lead.createdAt, "MM-dd")}
                    </span>
                  </span>
                  <span className="flex items-baseline gap-1 text-xs leading-tight text-ash">
                    <span className="text-[10.5px] tracking-wide text-dove">更新</span>
                    <span
                      className="tabular-nums"
                      title={`更新 ${safeFormatDate(lead.updatedAt, "yyyy-MM-dd HH:mm")}`}
                    >
                      {safeFormatDate(lead.updatedAt, "MM-dd")}
                    </span>
                  </span>
                </div>
              </td>

              {/* 操作（设计稿：文字链「查看 / 删除」） */}
              <td className="whitespace-nowrap px-2.5 py-2.5 pr-4 text-right align-middle">
                <div
                  className="flex items-center justify-end gap-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className="rounded text-[12.5px] text-graphite transition-colors hover:text-ink"
                    onClick={() => onOpenDetail(lead.id)}
                  >
                    查看
                  </button>
                  <HasPermission code={PERMISSION_CODES.LEAD_WRITE}>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          className="rounded text-[12.5px] text-graphite transition-colors hover:text-ink"
                        >
                          删除
                        </button>
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
