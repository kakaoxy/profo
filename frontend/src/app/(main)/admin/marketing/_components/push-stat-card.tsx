"use client";

import { memo } from "react";
import type { L4MarketingProject } from "@/app/(main)/admin/marketing/types";

/** 推送统计卡 props. */
interface PushStatCardProps {
  project: L4MarketingProject;
}

/** 统计格（纯展示）. */
function StatTile({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "warm" | "cool";
}) {
  return (
    <div
      className={`rounded-lg border border-dove/40 p-4 ${
        tone === "warm" ? "bg-apricot-wash" : "bg-fog"
      }`}
    >
      <div className="mb-1 text-xs text-graphite">{label}</div>
      <div className="text-2xl font-semibold text-ink tabular-nums">
        {count}
        <span className="ml-1 text-xs font-normal text-graphite">位用户</span>
      </div>
    </div>
  );
}

/**
 * 推送统计卡（自原 NotifySection 拆出，纯展示）.
 *
 * - 数据来源为 L4MarketingProjectResponse 聚合字段 notify_summary（服务端填充，
 *   详情/列表共用口径），无额外请求
 * - 草稿或统计缺失时显示引导文案；底部脚注承接原 NotifySection 的推送说明
 * - 宿主（详情页）在调价成功后 reloadDetail 换入新 project，本卡随之更新
 */
export const PushStatCard = memo(function PushStatCard({ project }: PushStatCardProps) {
  const summary = project.notify_summary;
  const isPublished = project.publish_status === "发布";
  const hasSummaryData =
    !!summary && (summary.new_listing_count > 0 || summary.price_change_count > 0);

  return (
    <div id="push-stat-card" className="bg-white rounded-cards shadow-steep-sm p-6">
      <h3 className="mb-3 text-xs font-medium text-ink">推送统计</h3>
      {isPublished && summary ? (
        <div className="grid grid-cols-2 gap-4">
          <StatTile
            label="上新通知累计送达"
            count={summary.new_listing_count}
            tone="warm"
          />
          <StatTile
            label="调价通知累计送达"
            count={summary.price_change_count}
            tone="cool"
          />
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          草稿房源发布后开始推送订阅通知
        </div>
      )}
      <p className="mt-3 text-[10px] leading-relaxed text-dove">
        授权订阅用户在额度有效期内收到微信服务通知；分次送达明细见调价历史。
        {!hasSummaryData && !isPublished &&
          "订阅用户授权后，房源上新/调价将自动推送微信服务通知；送达人数在此累计。"}
      </p>
    </div>
  );
});
