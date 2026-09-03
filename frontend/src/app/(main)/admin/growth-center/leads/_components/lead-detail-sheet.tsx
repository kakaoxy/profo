"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { safeFormatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { components } from "@/lib/api-types";
import type { LeadSource, UnifiedLeadStatus } from "../../types";
import { GROWTH_MODULE_META, GROWTH_SOURCE_META, GROWTH_STATUS_META } from "../../types";
import type { LeadEliminateReason } from "../../_lib/flow-constants";
import { ELIMINATE_REASON_REQUIRED, FLOW_MATRIX } from "../../_lib/flow-constants";
import {
  getLeadDetailAction,
  getGrowthLeadPhoneAction,
  updateGrowthLeadStatusAction,
} from "../../_lib/growth-actions";
import { FlowConfirmDialog, type FlowConfirmMode } from "./flow-confirm-dialog";

type UnifiedLeadListItem = components["schemas"]["UnifiedLeadListItem"];
type LeadDetailResponse = components["schemas"]["LeadDetailResponse"];
type TimelineEvent = components["schemas"]["TimelineEvent"];

interface LeadDetailSheetProps {
  /** 当前查看的线索（列表行，null 表示抽屉关闭） */
  lead: UnifiedLeadListItem | null;
  /** 关闭抽屉回调 */
  onClose: () => void;
}

/** 停留毫秒 → 「X 秒 / X 分 X 秒」 */
function formatStayed(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s >= 60) return `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
  return `${s} 秒`;
}

/** 时间线事件描述（按事件标识区分，未发生返回 null 由外层渲染灰态文案） */
function eventDesc(ev: TimelineEvent): string | null {
  if (!ev.occurred) return null;
  switch (ev.event) {
    case "share":
      return ev.share_type
        ? (GROWTH_SOURCE_META[ev.share_type as LeadSource]?.label ?? ev.share_type)
        : null;
    case "visit":
      return ev.source ?? null;
    case "deep_view":
      return ev.stayed_ms != null ? `停留 ${formatStayed(ev.stayed_ms)}` : null;
    case "lead_submit":
      return "完成留资";
    default:
      return null;
  }
}

interface ModuleFieldRow {
  label: string;
  value: string;
}

/** 模块差异化字段区块（按 detail 响应实际非空字段渲染） */
function moduleFieldBox(detail: LeadDetailResponse): {
  title: string;
  rows: ModuleFieldRow[];
} {
  const rows: ModuleFieldRow[] = [];
  const push = (label: string, value: string | number | null | undefined, suffix = "") => {
    if (value !== null && value !== undefined && value !== "") {
      rows.push({ label, value: `${value}${suffix}` });
    }
  };

  switch (detail.module) {
    case "valuation":
      push("小区名称", detail.community_name);
      push("建筑面积", detail.area, "㎡");
      push("户型", detail.layout);
      push("当前授权总价", detail.total_price, " 万");
      push("评估价", detail.eval_price, " 万");
      push("客户心理价", detail.expected_price, " 万");
      return { title: "估价信息", rows };
    case "booking":
      push("房源名称", detail.property_title);
      push(
        "预约时间",
        detail.booking_time ? safeFormatDate(detail.booking_time, "yyyy-MM-dd HH:mm", "—") : null,
      );
      return { title: "预约信息", rows };
    case "sheet":
      push("来源房源单", detail.sheet_code);
      push("小区名称", detail.community_name);
      push("建筑面积", detail.area, "㎡");
      push("户型", detail.layout);
      push("客户心理价", detail.expected_price, " 万");
      return { title: "承接估价信息（referrer 续传）", rows };
    case "recruit":
      push("主营商圈", detail.main_business_area);
      push("来源活动", detail.campaign_name);
      if (detail.is_internal) rows.push({ label: "标记", value: "内部员工" });
      return { title: "招募信息", rows };
    default:
      return { title: "模块信息", rows };
  }
}

/** 抽屉区块标题（对齐设计稿 .d-sec-title） */
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[13px] font-medium text-graphite mb-2">{children}</div>;
}

/**
 * 线索详情抽屉（对齐设计稿 Screen 2 抽屉）：
 * 打开时经 Server Action 请求 `/leads/{module}/{lead_id}`，呈现归因链路时间线、
 * 基础信息、模块差异化字段；全模块支持状态流转（FLOW_MATRIX 矩阵驱动）与完整手机号查看。
 */
export function LeadDetailSheet({ lead, onClose }: LeadDetailSheetProps) {
  const router = useRouter();
  const [detail, setDetail] = React.useState<LeadDetailResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // 完整手机号（有手机号的线索均可查看）
  const [fullPhone, setFullPhone] = React.useState<string | null>(null);
  const [phoneLoading, setPhoneLoading] = React.useState(false);

  // 状态流转进行中
  const [flowing, setFlowing] = React.useState(false);

  // 旁路流转确认弹窗（淘汰 / 重新激活）
  const [confirmMode, setConfirmMode] = React.useState<FlowConfirmMode | null>(null);

  // 打开抽屉时按需拉取详情
  React.useEffect(() => {
    if (!lead) {
      setDetail(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    setFullPhone(null);
    getLeadDetailAction(lead.module, lead.id)
      .then((res) => {
        if (cancelled) return;
        if (res.success) {
          setDetail(res.data);
        } else {
          setError(res.error);
        }
      })
      .catch(() => {
        if (!cancelled) setError("网络错误，请稍后重试");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lead]);

  const handleViewFullPhone = async () => {
    if (!detail) return;
    setPhoneLoading(true);
    try {
      const result = await getGrowthLeadPhoneAction(detail.module, detail.id);
      if (result.success) {
        setFullPhone(result.data);
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("网络错误，请稍后重试");
    } finally {
      setPhoneLoading(false);
    }
  };

  const handleCopyPhone = () => {
    if (!fullPhone) return;
    navigator.clipboard
      .writeText(fullPhone)
      .then(() => toast.success("手机号已复制"))
      .catch(() => toast.error("复制失败，请手动复制"));
  };

  /** 直达流转（淘汰 / 重新激活经确认弹窗附带 reason/remark） */
  const handleFlow = async (
    target: UnifiedLeadStatus,
    extra?: { reason?: LeadEliminateReason; remark?: string },
  ) => {
    if (!detail || detail.unified_status === target) return;
    setFlowing(true);
    try {
      const result = await updateGrowthLeadStatusAction(detail.module, detail.id, {
        status: target,
        remark: extra?.remark,
        reason: extra?.reason,
      });
      if (result.success) {
        toast.success(`状态已流转为「${GROWTH_STATUS_META[result.data.unified_status].label}」`);
        setDetail({ ...detail, unified_status: result.data.unified_status });
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } catch {
      toast.error("网络错误，请稍后重试");
    } finally {
      setFlowing(false);
      setConfirmMode(null);
    }
  };

  /** 目标状态菜单点击：淘汰 / 重新激活走确认弹窗，其余直达流转 */
  const handleTargetSelect = (target: UnifiedLeadStatus) => {
    if (!detail) return;
    if (target === "eliminated") {
      setConfirmMode("eliminate");
      return;
    }
    if (detail.unified_status === "eliminated" && target === "contacted") {
      setConfirmMode("reactivate");
      return;
    }
    void handleFlow(target);
  };

  /** 菜单项文案：eliminated → contacted 为重新激活，其余用统一状态标签 */
  const targetLabel = (target: UnifiedLeadStatus): string =>
    detail && detail.unified_status === "eliminated" && target === "contacted"
      ? "重新激活"
      : GROWTH_STATUS_META[target].label;

  const fieldBox = detail ? moduleFieldBox(detail) : null;

  return (
    <Sheet
      open={!!lead}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-md p-6 overflow-y-auto">
        <SheetTitle className="text-base font-medium text-ink mb-5">线索详情</SheetTitle>
        <SheetDescription className="sr-only">线索详细信息</SheetDescription>

        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-slate">
            <Loader2 className="h-4 w-4 animate-spin" />
            加载中...
          </div>
        )}

        {!loading && error && (
          <div className="py-16 text-center text-[13px] text-slate">{error}</div>
        )}

        {!loading && !error && detail && (
          <div className="flex flex-col gap-[22px]">
            {/* 手机号：有号码即可查看完整号码（估价/房源单无手机号时按钮自然隐藏） */}
            <section>
              <SectionTitle>手机号</SectionTitle>
              <div className="flex items-center flex-wrap gap-3 text-[15px] font-medium text-ink tabular-nums">
                {fullPhone ? (
                  <>
                    <span>{fullPhone}</span>
                    <button
                      type="button"
                      onClick={handleCopyPhone}
                      className="inline-flex items-center gap-1 text-[13px] font-medium text-ink hover:opacity-60 transition-opacity"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      复制
                    </button>
                  </>
                ) : (
                  <span>{detail.phone_masked ?? "—"}</span>
                )}
                {!fullPhone && detail.phone_masked && (
                  <HasPermission code={PERMISSION_CODES.RECRUIT_WRITE}>
                    <button
                      type="button"
                      onClick={handleViewFullPhone}
                      disabled={phoneLoading}
                      className="h-8 px-3 rounded-[10px] bg-ink text-white text-[13px] font-medium inline-flex items-center gap-1 hover:opacity-85 transition-opacity disabled:opacity-50"
                    >
                      {phoneLoading && <Loader2 className="h-3 w-3 animate-spin" />}
                      查看完整号码
                    </button>
                  </HasPermission>
                )}
              </div>
              {detail.is_internal && (
                <div className="mt-2 text-[12.5px] text-graphite">内部员工标记：不计入有效新客</div>
              )}
            </section>

            {/* 归因链路时间线 */}
            <section>
              <SectionTitle>归因链路</SectionTitle>
              <div>
                {detail.timeline.map((ev, index) => {
                  const isLast = index === detail.timeline.length - 1;
                  const desc = ev.occurred ? eventDesc(ev) : null;
                  return (
                    <div
                      key={`${ev.event}-${index}`}
                      className={cn("relative pl-6 pb-[18px] last:pb-0.5")}
                    >
                      {!isLast && (
                        <div className="absolute left-[5px] top-4 bottom-0 w-0.5 bg-fog" />
                      )}
                      <div
                        className={cn(
                          "absolute left-0 top-1 h-3 w-3 rounded-full",
                          ev.occurred
                            ? "bg-ink ring-4 ring-[#eceef2]"
                            : "bg-white ring-2 ring-inset ring-[#c9ccd4]",
                        )}
                      />
                      <div
                        className={cn(
                          "text-[13.5px]",
                          ev.occurred ? "font-medium text-ink" : "font-normal text-[#c9ccd4]",
                        )}
                      >
                        {ev.label}
                      </div>
                      <div
                        className={cn(
                          "mt-0.5 text-[12.5px]",
                          ev.occurred ? "text-graphite" : "text-[#c9ccd4]",
                        )}
                      >
                        {ev.occurred ? (desc ?? "已完成") : "未发生 / 未埋点"}
                      </div>
                      {ev.occurred && ev.occurred_at && (
                        <div className="mt-0.5 text-xs text-slate tabular-nums">
                          {safeFormatDate(ev.occurred_at, "yyyy-MM-dd HH:mm")}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>

            {/* 基础信息 */}
            <section>
              <SectionTitle>基础信息</SectionTitle>
              <div className="grid grid-cols-2 gap-3.5 gap-x-5">
                <div>
                  <div className="text-[12.5px] text-graphite mb-1">归属员工</div>
                  <div className="text-[14px] text-ink">
                    {detail.employee_name ?? "—"}
                    {detail.employee_id ? ` · ${detail.employee_id}` : ""}
                  </div>
                </div>
                <div>
                  <div className="text-[12.5px] text-graphite mb-1">来源</div>
                  <div className="text-[14px] text-ink">
                    {detail.source ? GROWTH_SOURCE_META[detail.source].label : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[12.5px] text-graphite mb-1">留资时间</div>
                  <div className="text-[14px] text-ink tabular-nums">
                    {safeFormatDate(detail.created_at, "yyyy-MM-dd HH:mm")}
                  </div>
                </div>
                <div>
                  <div className="text-[12.5px] text-graphite mb-1">活动归属</div>
                  <div className="text-[14px] text-ink">
                    {detail.module === "recruit" ? (detail.campaign_name ?? "—") : "—"}
                  </div>
                </div>
              </div>
            </section>

            {/* 模块差异化字段 */}
            {fieldBox && fieldBox.rows.length > 0 && (
              <section className="bg-fog rounded-2xl p-4">
                <div className="flex items-center gap-2 flex-wrap text-[13px] font-medium text-ink mb-2.5">
                  <span
                    className={cn(
                      "inline-flex items-center text-[13px] font-medium px-3 py-0.5 rounded-full whitespace-nowrap",
                      GROWTH_MODULE_META[detail.module].badge,
                    )}
                  >
                    {GROWTH_MODULE_META[detail.module].label}
                  </span>
                  {fieldBox.title}
                </div>
                <div>
                  {fieldBox.rows.map((row) => (
                    <div key={row.label} className="flex justify-between gap-3 text-[13px] py-1">
                      <span className="text-graphite shrink-0">{row.label}</span>
                      <span className="text-ink font-medium text-right">{row.value}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* 状态流转（全模块 + 写权限，可选目标由 FLOW_MATRIX 矩阵驱动） */}
            <HasPermission code={PERMISSION_CODES.RECRUIT_WRITE}>
              <section>
                <SectionTitle>状态流转</SectionTitle>
                <div className="flex items-center flex-wrap gap-3">
                  <span
                    className={cn(
                      "inline-flex items-center text-[13px] font-medium px-3 py-0.5 rounded-full whitespace-nowrap",
                      GROWTH_STATUS_META[detail.unified_status].badge,
                    )}
                  >
                    {GROWTH_STATUS_META[detail.unified_status].label}
                  </span>
                  {FLOW_MATRIX[detail.module][detail.unified_status].length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          disabled={flowing}
                          className="h-8.5 px-3 rounded-[10px] border border-dove bg-white text-[13px] text-ink inline-flex items-center gap-1 hover:border-graphite transition-colors disabled:opacity-50"
                        >
                          {flowing && <Loader2 className="h-3 w-3 animate-spin" />}
                          流转至
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {FLOW_MATRIX[detail.module][detail.unified_status].map((status) => (
                          <DropdownMenuItem
                            key={status}
                            onClick={() => handleTargetSelect(status)}
                          >
                            {targetLabel(status)}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </section>
            </HasPermission>
          </div>
        )}
      </SheetContent>

      {/* 淘汰 / 重新激活旁路确认弹窗 */}
      <FlowConfirmDialog
        mode={confirmMode}
        submitting={flowing}
        reasonRequired={detail ? ELIMINATE_REASON_REQUIRED[detail.module] : false}
        onConfirm={({ reason, remark }) =>
          void handleFlow(
            confirmMode === "eliminate" ? "eliminated" : "contacted",
            { reason: reason ?? undefined, remark },
          )
        }
        onClose={() => setConfirmMode(null)}
      />
    </Sheet>
  );
}
