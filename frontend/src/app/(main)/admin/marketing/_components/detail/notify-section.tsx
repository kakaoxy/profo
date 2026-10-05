"use client";

import { memo } from "react";
import { Bell } from "lucide-react";
import { formatDate } from "./utils";
import type { L4MarketingProject } from "@/app/(main)/admin/marketing/types";

/** 订阅通知推送区块 props. */
interface NotifySectionProps {
  project: L4MarketingProject;
}

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
 * 订阅通知推送区块：送达统计 + 最近一次调价摘要.
 *
 * 数据来源为 L4MarketingProjectResponse 聚合字段 notify_summary /
 * latest_price_change（服务端 aggregate_notify_fields 批量填充），
 * 详情接口与列表共用同一口径，无额外请求。
 */
export const NotifySection = memo(function NotifySection({ project }: NotifySectionProps) {
  const summary = project.notify_summary;
  const change = project.latest_price_change;
  const isPublished = project.publish_status === "发布";
  const hasData =
    !!summary && (summary.new_listing_count > 0 || summary.price_change_count > 0);

  return (
    <div className="bg-white rounded-cards shadow-steep-sm p-6">
      <h3 className="text-xs font-medium text-ink mb-3 flex items-center gap-1.5">
        <Bell className="h-3.5 w-3.5 text-graphite" />
        订阅通知推送
      </h3>

      {/* 统计卡（仅已发布房源有推送语义） */}
      {isPublished && summary ? (
        <div className="grid grid-cols-2 gap-4">
          <StatCard label="上新通知" count={summary.new_listing_count} tone="apricot" />
          <StatCard label="调价通知" count={summary.price_change_count} tone="mint" />
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">草稿房源发布后开始推送订阅通知</div>
      )}

      {/* 最近一次调价摘要 */}
      {change && (
        <div className="mt-4 rounded-lg border border-dove/40 p-4">
          <div className="text-xs text-graphite mb-2">最近一次调价</div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium text-ink tabular-nums">
              {change.old_price} → {change.new_price} 万
              <span
                className={`ml-2 text-xs font-medium ${change.direction === "down" ? "text-success" : "text-graphite"}`}
              >
                {change.direction === "down" ? "↓ 下调" : "↑ 上调"}
              </span>
            </span>
            <span className="text-xs text-graphite">{formatDate(change.changed_at)}</span>
          </div>
        </div>
      )}

      {!hasData && !change && (
        <div className="mt-3 text-xs text-dove">
          订阅用户授权后，房源上新/调价将自动推送微信服务通知；送达人数在此累计。
        </div>
      )}
    </div>
  );
});
