"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CheckCircle2, Pencil, TrendingDown, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { toast } from "sonner";
import { safeFormatDate } from "@/lib/formatters";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import type { components } from "@/lib/api-types";
import {
  updateL4MarketingProjectPriceAction,
  getL4MarketingPriceChangesAction,
} from "../actions/projects";
import type { L4MarketingProject } from "@/app/(main)/admin/marketing/types";

/** 调价历史时间线条目（复用 OpenAPI 生成类型，禁止本地重复声明）. */
type PriceChangeTimelineItem =
  components["schemas"]["L4MarketingPriceChangeTimelineItem"];

// ============================================================================
// 纯函数与口径（浏览态降级文案、差价五态、单价折算均在此层，组件仅做渲染）
// ============================================================================

/** 入口可见性判定：已发布 + 有写权限 + 非已售（详情卡与列表弹层共用，spec D-1 裁定）. */
export function showPricingEntry(
  project: L4MarketingProject,
  canWrite: boolean,
): boolean {
  return (
    project.publish_status === "发布" &&
    canWrite &&
    project.project_status !== "已售"
  );
}

/** 差价 chip 状态：idle/invalid/same/down/up 五态，禁止用布尔拼凑. */
export type DiffState = "idle" | "invalid" | "same" | "down" | "up";

/** 由输入值推导差价状态（空=idle，≤0=invalid，其余按与当前价比较）. */
export function resolveDiffState(
  input: number | undefined,
  current: number,
): DiffState {
  if (input === undefined || Number.isNaN(input)) return "idle";
  if (input <= 0) return "invalid";
  if (input === current) return "same";
  return input < current ? "down" : "up";
}

/**
 * 后端金额/面积序列化为 string，统一转 number 并做 NaN 防护.
 * 金额语义上 0 是合法值（免费/极小价），此处返回 0 即「不可用于计算」。
 */
function toNum(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

/** 总价大数字展示：428 → "428"，421.5 → "421.5"（去尾零 + 千分位）. */
function formatWanDisplay(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "-";
  return parseFloat(n.toFixed(2)).toLocaleString("en-US");
}

/**
 * 单价折算（元/㎡）：new_total_price × 10000 ÷ area.
 * 面积未知或 ≤0 时返回 null（除零/NaN 防护），调用方不渲染折算行。
 */
function calcUnitPrice(totalWan: number, areaSqm: number): number | null {
  if (!Number.isFinite(totalWan) || totalWan <= 0) return null;
  if (!Number.isFinite(areaSqm) || areaSqm <= 0) return null;
  return Math.round((totalWan * 10000) / areaSqm);
}

// ============================================================================
// zod schema（自 detail/notify-section.tsx 平移，语义不变：总价必须大于 0）
// ============================================================================

const priceChangeSchema = z.object({
  total_price: z.number({ error: "请输入新总价" }).positive("总价必须大于 0"),
});
type PriceChangeValues = z.infer<typeof priceChangeSchema>;

// ============================================================================
// 组件
// ============================================================================

/** 调价三态独立组件 props. */
export interface PriceChangeCardProps {
  project: L4MarketingProject;
  /** card=详情右栏完整形态（三态）；popover=列表行内紧凑形态（恒为表单态） */
  variant: "card" | "popover";
  /** 提交成功后由宿主执行（reloadDetail / router.refresh 等）；组件不感知宿主路由 */
  onPriceSuccess?: (newPrice: number) => void;
  /** 取消回调：card=回浏览态；popover=宿主关闭弹层 */
  onCancel?: () => void;
}

/**
 * 调价独立组件：浏览 / 表单 / 成功三态同位切换（useState 不进 URL）.
 *
 * - 浏览态（仅 card）：当前总价大数字 + 单价折算 + 最近一次调价条（latest_price_change，
 *   服务端 7 天窗口下发）+ 历史时间线（card 挂载即拉，倒序全量，默认折叠）
 * - 表单态：实时差价 chip（降价 success 绿 / 上调 Graphite 灰 / 同值禁用提交），
 *   Esc 退出（card）；popover 变体恒为表单态
 * - 成功态（仅 card）：显式转达「推送已排队」（不承诺具体送达人数——PUT 响应
 *   拿不到，notify_* 由后台任务异步写回时间线）
 * - 入口可见性 showPricingEntry（D-1）：草稿/无权限/已售降级为只读价格展示
 */
export const PriceChangeCard = memo(function PriceChangeCard({
  project,
  variant,
  onPriceSuccess,
  onCancel,
}: PriceChangeCardProps) {
  const isPopover = variant === "popover";
  const { hasPermission } = usePermission();
  const canWrite = hasPermission(PERMISSION_CODES.L4_MARKETING_WRITE);

  // 调价成功后的新价以 PUT 响应渲染；宿主 reloadDetail 换入新 project props 时同步
  const [displayProject, setDisplayProject] = useState<L4MarketingProject>(project);
  useEffect(() => {
    setDisplayProject(project);
  }, [project]);

  // 三态状态机（popover 恒为 form：宿主弹层只承载表单语义）
  const [mode, setMode] = useState<"browse" | "form" | "success">(
    isPopover ? "form" : "browse",
  );
  const [submitting, setSubmitting] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{ old: number; new: number } | null>(
    null,
  );

  const currentPrice = toNum(displayProject.total_price);
  const areaSqm = toNum(displayProject.area);
  const showEntry = showPricingEntry(displayProject, canWrite);
  const latestChange = displayProject.latest_price_change;

  // 调价历史时间线（懒加载：card 挂载即拉；popover 不拉，仅表单语义）
  const [timeline, setTimeline] = useState<PriceChangeTimelineItem[] | null>(null);
  const [tlOpen, setTlOpen] = useState(false);
  const timelineLoadedRef = useRef(false);

  const loadTimeline = useCallback(async () => {
    const res = await getL4MarketingPriceChangesAction(displayProject.id);
    if (res.success) {
      setTimeline(res.data.items as PriceChangeTimelineItem[]);
    } else {
      // 历史加载失败不打断调价表单，仅提示
      toast.error(res.error || "加载调价历史失败");
    }
  }, [displayProject.id]);

  useEffect(() => {
    if (isPopover || timelineLoadedRef.current) return;
    timelineLoadedRef.current = true;
    void loadTimeline();
  }, [isPopover, loadTimeline]);

  // 表单：空输入起算（与设计稿一致；zod 在提交时兜底校验）
  const form = useForm<PriceChangeValues>({
    resolver: zodResolver(priceChangeSchema),
    defaultValues: { total_price: undefined },
    mode: "onChange",
  });
  const newPrice = form.watch("total_price");
  const diffState = resolveDiffState(newPrice, currentPrice);
  const confirmDisabled = submitting || diffState === "idle" || diffState === "invalid" || diffState === "same";

  /** 进入表单态（card）：清空上次输入，自动 focus 由 FormControl autoFocus 承担 */
  const openPricing = useCallback(() => {
    form.reset({ total_price: undefined });
    setMode("form");
  }, [form]);

  /** 取消：card 回浏览态并清输入；popover 交由宿主关闭弹层 */
  const cancelPricing = useCallback(() => {
    form.reset({ total_price: undefined });
    if (isPopover) {
      onCancel?.();
    } else {
      setMode("browse");
    }
  }, [form, isPopover, onCancel]);

  // card 表单态 Esc 退出（popover 的 Esc 由 Radix 弹层处理，不在此监听）
  useEffect(() => {
    if (isPopover || mode !== "form") return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      cancelPricing();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isPopover, mode, cancelPricing]);

  /** 提交：PUT 局部更新（后端 exclude_unset；同值不产生调价记录/通知） */
  const submitPrice = form.handleSubmit(async (values) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await updateL4MarketingProjectPriceAction(
        displayProject.id,
        values.total_price,
      );
      if (!res.success) {
        toast.error(res.error || "调价失败");
        return;
      }
      // 成功：新价以 PUT 响应渲染（total_price/unit_price/latest_price_change 均在响应中）
      const oldPrice = currentPrice;
      setDisplayProject(res.data);
      setSuccessInfo({ old: oldPrice, new: values.total_price });
      form.reset({ total_price: undefined });
      if (isPopover) {
        toast.success(
          `${oldPrice.toFixed(2)} → ${values.total_price.toFixed(2)} 万已生效，订阅推送已排队`,
        );
      } else {
        setMode("success");
        setTlOpen(true); // 成功后自动展开时间线
        toast.success("调价成功，订阅推送已排队");
      }
      // 时间线已加载则静默重拉（送达计数由后台任务异步回填）；popover 未加载不拉
      if (!isPopover && timeline !== null) {
        void loadTimeline();
      }
      onPriceSuccess?.(values.total_price);
    } finally {
      setSubmitting(false);
    }
  });

  const unitPriceHint = (wan: number): string => {
    const u = calcUnitPrice(wan, areaSqm);
    return u !== null ? `按 ${areaSqm} ㎡ 折合单价约 ${u.toLocaleString("en-US")} 元/㎡` : "";
  };

  // ── 差价 chip（五态） ──
  const diffChip = (() => {
    switch (diffState) {
      case "idle":
        return (
          <span className="rounded-full bg-fog px-3 py-1 text-xs font-normal text-dove">
            输入新总价
          </span>
        );
      case "invalid":
        return (
          <span className="rounded-full bg-fog px-3 py-1 text-xs font-medium text-graphite">
            总价必须大于 0
          </span>
        );
      case "same":
        return (
          <span className="rounded-full bg-fog px-3 py-1 text-xs font-medium text-ash">
            价格未变化
          </span>
        );
      case "down":
        return (
          <span className="rounded-full bg-success-container px-3 py-1 text-xs font-medium text-success tabular-nums">
            ↓ 直降 {(currentPrice - (newPrice ?? 0)).toFixed(2)} 万
          </span>
        );
      case "up":
        return (
          <span className="rounded-full bg-fog px-3 py-1 text-xs font-medium text-graphite tabular-nums">
            ↑ 上调 {((newPrice ?? 0) - currentPrice).toFixed(2)} 万
          </span>
        );
    }
  })();

  // ── 表单态（两变体共用；popover 隐藏单价折算提示与推送脚注） ──
  const formPane = (
    <Form {...form}>
      <form onSubmit={(e) => void submitPrice(e)}>
        <div className="flex items-center justify-between text-sm">
          <span className="text-graphite">当前总价</span>
          <span className="font-medium text-ink tabular-nums">
            {currentPrice.toFixed(2)} 万
          </span>
        </div>

        <FormField
          control={form.control}
          name="total_price"
          render={({ field }) => (
            <FormItem>
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-sm text-graphite shrink-0">新总价（万）</span>
                <FormControl>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    autoFocus
                    className="w-40 text-right text-lg font-medium tabular-nums"
                    {...field}
                    onChange={(e) => {
                      const v = e.target.value === "" ? undefined : Number(e.target.value);
                      field.onChange(Number.isFinite(v) ? v : undefined);
                    }}
                    value={field.value ?? ""}
                  />
                </FormControl>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        {!isPopover && (
          <div className="mt-1 text-right text-[11px] text-dove">
            {newPrice !== undefined && unitPriceHint(newPrice)
              ? unitPriceHint(newPrice)
              : `按 ${areaSqm || "-"} ㎡ 折合单价将同步更新`}
          </div>
        )}

        <div className="mt-3 flex justify-end">{diffChip}</div>

        {!isPopover && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-apricot-wash px-3 py-2 text-[11px] leading-relaxed text-rust">
            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-rust" />
            <span>
              确认后订阅用户将收到微信服务通知（推送由后台异步执行，送达结果稍后回历史核对）
            </span>
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2 border-t border-dove/40 pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-full border-dove bg-white text-ink hover:bg-fog"
            disabled={submitting}
            onClick={cancelPricing}
          >
            取消
          </Button>
          <Button
            type="submit"
            size="sm"
            className="rounded-full bg-ink text-white hover:bg-ink/90"
            disabled={confirmDisabled}
          >
            {submitting ? "提交中..." : "确认调价"}
          </Button>
        </div>
      </form>
    </Form>
  );

  // popover 变体：仅表单态（标题/关闭由宿主 PricePopover 承载）
  if (isPopover) {
    return formPane;
  }

  // ── 浏览态 ──
  const browsePane = (
    <div>
      <div className="text-[11px] tracking-wide text-graphite">当前总价</div>
      <div className="font-display mt-1.5 text-[40px] leading-none tracking-tight text-ink">
        {formatWanDisplay(currentPrice)}
        <span className="ml-1 font-sans text-sm font-normal text-graphite">万</span>
      </div>
      {(() => {
        const hint = unitPriceHint(currentPrice);
        return hint ? (
          <div className="mt-1.5 text-[11px] text-graphite tabular-nums">{hint}</div>
        ) : null;
      })()}

      {/* 最近一次调价条（latest_price_change，服务端 7 天窗口下发；降价=success 绿） */}
      {latestChange && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-fog px-3 py-2">
          <span className="text-[11px] text-graphite">
            最近一次{" "}
            <b className="font-medium text-ash">
              {safeFormatDate(latestChange.changed_at, "MM-dd")}
            </b>{" "}
            · {latestChange.old_price.toFixed(2)} → {latestChange.new_price.toFixed(2)}
          </span>
          <span
            className={`whitespace-nowrap text-xs font-medium tabular-nums ${
              latestChange.direction === "down" ? "text-success" : "text-graphite"
            }`}
          >
            {latestChange.direction === "down" ? "↓ 直降" : "↑ 上调"}{" "}
            {Math.abs(latestChange.new_price - latestChange.old_price).toFixed(2)} 万
          </span>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        {showEntry ? (
          <Button
            size="sm"
            className="rounded-full bg-ink text-white hover:bg-ink/90"
            onClick={openPricing}
          >
            <Pencil className="mr-1 h-3 w-3" />
            调价
          </Button>
        ) : (
          <span className="text-[11px] text-dove">
            {displayProject.publish_status !== "发布"
              ? "草稿房源发布后开放调价"
              : !canWrite
                ? "仅查看权限，如需调价请联系管理员"
                : ""}
          </span>
        )}
        {showEntry && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 rounded-full text-xs text-graphite hover:bg-fog hover:text-ink"
            onClick={() => setTlOpen((v) => !v)}
          >
            调价历史{timeline !== null ? ` (${timeline.length})` : ""}
          </Button>
        )}
      </div>

      {/* 时间线（默认折叠；成功后自动展开；加载中不渲染列表） */}
      {showEntry && tlOpen && (
        <div className="mt-4 border-t border-dove/40 pt-3">
          <div className="mb-2.5 flex items-center justify-between">
            <span className="text-[11px] tracking-wide text-graphite">调价历史</span>
            <span className="font-mono text-[10px] text-dove tabular-nums">
              共 {timeline?.length ?? 0} 次
            </span>
          </div>
          {timeline !== null && timeline.length === 0 && (
            <div className="text-[11px] leading-relaxed text-dove">
              暂无调价记录。点击「调价」更新总价后，订阅用户将收到微信推送。
            </div>
          )}
          {timeline !== null && timeline.length > 0 && (
            <div>
              {timeline.map((item) => {
                const delivered = item.notify_success + item.notify_skipped + item.notify_failed;
                return (
                  <div
                    key={item.id}
                    className="relative border-l border-dove/40 pb-3.5 pl-4 last:border-l-transparent last:pb-0"
                  >
                    <span
                      className={`absolute -left-[4.5px] top-1 h-2 w-2 rounded-full border-2 bg-white ${
                        item.direction === "down" ? "border-success" : "border-slate"
                      }`}
                    />
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-ink tabular-nums">
                        {item.old_price.toFixed(2)} → {item.new_price.toFixed(2)} 万
                        <span
                          className={`ml-2 inline-flex items-center text-[11px] font-medium ${
                            item.direction === "down" ? "text-success" : "text-graphite"
                          }`}
                        >
                          {item.direction === "down" ? (
                            <>
                              <TrendingDown className="mr-0.5 h-3 w-3" />
                              降价
                            </>
                          ) : (
                            <>
                              <TrendingUp className="mr-0.5 h-3 w-3" />
                              涨价
                            </>
                          )}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-dove">
                        {safeFormatDate(item.changed_at, "MM-dd HH:mm")}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-graphite tabular-nums">
                      {delivered > 0 ? (
                        <>
                          送达 {item.notify_success} 人
                          {item.notify_skipped > 0 && <span> · 跳过 {item.notify_skipped}</span>}
                          {item.notify_failed > 0 && (
                            <span className="text-error"> · 失败 {item.notify_failed}</span>
                          )}
                        </>
                      ) : (
                        "推送已排队 · 送达统计稍后更新"
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );

  // ── 成功态 ──
  const successPane = (
    <div className="py-1 text-center">
      <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-full bg-success-container text-success">
        <CheckCircle2 className="h-5 w-5" />
      </div>
      <div className="font-display text-2xl tracking-tight text-ink">
        {successInfo ? successInfo.old.toFixed(2) : currentPrice.toFixed(2)}
        <span className="mx-1.5 font-sans text-base text-dove">→</span>
        <span className="text-success tabular-nums">
          {successInfo ? successInfo.new.toFixed(2) : formatWanDisplay(currentPrice)} 万
        </span>
      </div>
      <div className="mt-2 text-[11px] leading-relaxed text-graphite">
        订阅推送已排队 · 送达结果稍后回「调价历史」核对
      </div>
      <div className="mt-4 flex justify-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="rounded-full text-xs text-graphite hover:bg-fog hover:text-ink"
          onClick={() => {
            document
              .getElementById("push-stat-card")
              ?.scrollIntoView({ behavior: "smooth", block: "center" });
          }}
        >
          查看推送统计
        </Button>
        <Button
          size="sm"
          className="rounded-full bg-ink text-white hover:bg-ink/90"
          onClick={() => setMode("browse")}
        >
          完成
        </Button>
      </div>
    </div>
  );

  return (
    <div className="bg-white rounded-cards shadow-steep-sm p-6">
      <h3 className="mb-3 text-xs font-medium text-ink">价格与调价</h3>
      {mode === "browse" ? browsePane : mode === "form" ? formPane : successPane}
    </div>
  );
});
