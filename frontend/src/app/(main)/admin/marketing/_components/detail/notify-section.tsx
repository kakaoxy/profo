"use client";

import { memo, useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Bell, TrendingDown, TrendingUp, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { toast } from "sonner";
import { formatDate } from "./utils";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import {
  updateL4MarketingProjectPriceAction,
  getL4MarketingPriceChangesAction,
  type ActionResult,
} from "../../actions/projects";
import type { L4MarketingProject } from "@/app/(main)/admin/marketing/types";

/** 订阅通知推送区块 props. */
interface NotifySectionProps {
  project: L4MarketingProject;
  /** 调价成功后刷新列表（router.refresh 由宿主执行，行总价/调价副行同步） */
  onRefresh?: () => void;
}

/** 时间线条目类型（与后端 L4MarketingPriceChangeTimelineItem 对齐）. */
interface PriceChangeTimelineItem {
  id: number;
  old_price: number;
  new_price: number;
  direction: string;
  changed_at: string;
  notify_success: number;
  notify_skipped: number;
  notify_failed: number;
}

// 内联调价表单 schema（spec：总价必须大于0；zod v4 用 error 映射替代 invalid_type_error）
const priceChangeSchema = z.object({
  total_price: z.number({ error: "请输入新总价" }).positive("总价必须大于0"),
});
type PriceChangeValues = z.infer<typeof priceChangeSchema>;

/** 统计卡（上新/调价送达人数）. */
function StatCard({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "apricot" | "mint";
}) {
  const bgClass = tone === "apricot" ? "bg-apricot-wash border-dove/40" : "bg-fog border-dove/40";
  return (
    <div className={`rounded-lg p-4 border ${bgClass}`}>
      <div className="text-xs text-graphite mb-1">{label}</div>
      <div className="text-2xl font-semibold text-ink tabular-nums">
        {count}
        <span className="ml-1 text-xs font-normal text-graphite">位用户</span>
      </div>
    </div>
  );
}

/**
 * 订阅与调价卡片：送达统计 + 内联调价表单 + 调价历史时间线.
 *
 * - 送达统计数据来源为 L4MarketingProjectResponse 聚合字段 notify_summary，
 *   详情接口与列表共用同一口径，无额外请求
 * - 内联调价：点「调价」→ 卡片内切换表单态（不弹窗不跳页），实时差价 chip，
 *   同值禁用提交；成功 toast 不承诺通知人数（后台异步）
 * - 时间线：懒加载（首次展开拉取），倒序展示每次调价及分次送达统计
 */
export const NotifySection = memo(function NotifySection({
  project,
  onRefresh,
}: NotifySectionProps) {
  const router = useRouter();
  const { hasPermission } = usePermission();
  const canWrite = hasPermission(PERMISSION_CODES.L4_MARKETING_WRITE);
  const isPublished = project.publish_status === "发布";

  const summary = project.notify_summary;
  const currentPrice = Number(project.total_price) || 0;
  const hasSummaryData =
    !!summary && (summary.new_listing_count > 0 || summary.price_change_count > 0);

  // 内联调价表单态（useState 不进 URL；edit 态下整卡调价入口隐藏由父级保证）
  const [pricing, setPricing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 调价历史时间线（懒加载：首次展开调价功能时拉取；时间线条目少，加载中直接不展示）
  const [timeline, setTimeline] = useState<PriceChangeTimelineItem[] | null>(null);
  const loadTimeline = useCallback(async () => {
    const res: ActionResult<{
      items: PriceChangeTimelineItem[];
      total: number;
    }> = await getL4MarketingPriceChangesAction(project.id);
    if (res.success) {
      setTimeline(res.data.items);
    } else {
      toast.error(res.error || "加载调价历史失败");
    }
  }, [project.id]);

  const form = useForm<PriceChangeValues>({
    resolver: zodResolver(priceChangeSchema),
    defaultValues: { total_price: currentPrice },
    mode: "onChange",
  });
  const newPrice = form.watch("total_price");
  const diff = Number.isFinite(newPrice) ? newPrice - currentPrice : 0;
  const sameValue = diff === 0;

  /** 进入内联表单态（同时拉取时间线） */
  const openPricing = useCallback(() => {
    setPricing(true);
    if (timeline === null) {
      loadTimeline();
    }
  }, [timeline, loadTimeline]);

  const cancelPricing = useCallback(() => {
    setPricing(false);
    form.reset({ total_price: currentPrice });
  }, [form, currentPrice]);

  const submitPrice = form.handleSubmit(async (values) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await updateL4MarketingProjectPriceAction(project.id, values.total_price);
      if (!res.success) {
        toast.error(res.error || "调价失败");
        return;
      }
      // 成功文案不承诺「已通知 N 位订阅用户」：推送由后台任务异步执行，PUT 响应拿不到数字
      toast.success("调价成功，订阅用户将收到推送");
      setPricing(false);
      form.reset({ total_price: values.total_price });
      router.refresh(); // 刷新详情时间线/统计卡（Server Component 数据）
      onRefresh?.(); // 刷新列表行总价/调价副行
    } finally {
      setSubmitting(false);
    }
  });

  // 草稿无推送对象、无写权限：不显示调价入口（edit 态由父级隐藏整卡入口）
  const showPricingEntry = isPublished && canWrite;

  return (
    <div className="bg-white rounded-cards shadow-steep-sm p-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-ink flex items-center gap-1.5">
          <Bell className="h-3.5 w-3.5 text-graphite" />
          订阅与调价
        </h3>
        {showPricingEntry && !pricing && (
          <Button
            variant="outline"
            size="sm"
            className="h-7 rounded-full border-dove bg-white text-xs text-ink hover:bg-fog"
            onClick={openPricing}
          >
            <Pencil className="mr-1 h-3 w-3" />
            调价
          </Button>
        )}
      </div>

      {/* 统计卡（仅已发布房源有推送语义） */}
      {isPublished && summary ? (
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="上新通知" count={summary.new_listing_count} tone="apricot" />
          <StatCard label="调价通知" count={summary.price_change_count} tone="mint" />
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">草稿房源发布后开始推送订阅通知</div>
      )}

      {/* 内联调价表单态（卡片内切换，其余区块不动） */}
      {pricing && (
        <div className="mt-4 rounded-lg border border-dove/40 p-4">
          <Form {...form}>
            <form onSubmit={submitPrice}>
              <div className="flex items-center justify-between text-sm mb-3">
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
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-graphite shrink-0">新总价（万）</span>
                      <FormControl>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="w-40 text-right tabular-nums"
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

              {/* 实时差价 chip：↓ 直降绿 / ↑ 上调灰 / 同值禁用提交 */}
              <div className="mt-3 flex justify-end">
                {sameValue ? (
                  <span className="rounded-full bg-fog px-3 py-1 text-xs font-medium text-ash">
                    价格未变化
                  </span>
                ) : diff < 0 ? (
                  <span className="rounded-full bg-success-container px-3 py-1 text-xs font-medium text-success tabular-nums">
                    ↓ 直降 {Math.abs(diff).toFixed(2)} 万
                  </span>
                ) : (
                  <span className="rounded-full bg-fog px-3 py-1 text-xs font-medium text-graphite tabular-nums">
                    ↑ 上调 {diff.toFixed(2)} 万
                  </span>
                )}
              </div>

              {/* [取消][确认调价] sticky 于卡片底部 */}
              <div className="sticky bottom-0 mt-4 flex justify-end gap-2 border-t border-dove/40 bg-white/95 pt-3 backdrop-blur-sm">
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
                  disabled={submitting || sameValue}
                >
                  {submitting ? "提交中..." : "确认调价"}
                </Button>
              </div>
            </form>
          </Form>
        </div>
      )}

      {/* 调价历史时间线（倒序；非表单态亦展示最近记录） */}
      {showPricingEntry && timeline !== null && timeline.length > 0 && (
        <div className="mt-4">
          <div className="text-xs text-graphite mb-2">调价历史</div>
          <div className="space-y-2">
            {timeline.map((item) => (
              <div key={item.id} className="rounded-lg border border-dove/40 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ink tabular-nums">
                    {item.old_price.toFixed(2)} → {item.new_price.toFixed(2)} 万
                    <span
                      className={`ml-2 inline-flex items-center text-xs font-medium ${
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
                  <span className="text-xs text-graphite">{formatDate(item.changed_at)}</span>
                </div>
                <div className="mt-1 text-xs text-graphite tabular-nums">
                  送达 {item.notify_success} 人
                  {item.notify_skipped > 0 && <span> · 跳过 {item.notify_skipped}</span>}
                  {item.notify_failed > 0 && (
                    <span className="text-error"> · 失败 {item.notify_failed}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 空态引导 */}
      {showPricingEntry && timeline !== null && timeline.length === 0 && (
        <div className="mt-3 text-xs text-dove">
          暂无调价记录。点击右上角「调价」更新房源总价，订阅用户将收到微信推送。
        </div>
      )}

      {!hasSummaryData && !showPricingEntry && (
        <div className="mt-3 text-xs text-dove">
          订阅用户授权后，房源上新/调价将自动推送微信服务通知；送达人数在此累计。
        </div>
      )}
    </div>
  );
});
