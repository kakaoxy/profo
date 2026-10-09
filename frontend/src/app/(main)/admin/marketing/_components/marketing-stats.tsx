import { FileText, Globe, Eye, CheckCircle, Bell, Zap } from "lucide-react";
import { StatCardGrid, type StatItem } from "@/app/(main)/admin/_components/stat-card-grid";

/** 订阅漏斗全局统计（GET /admin/marketing/subscription-stats 响应子集）. */
interface SubscriptionStats {
  new_listing_subscribers?: number;
  price_change_subscribers?: number;
  total_subscribers?: number;
  total_new_quota?: number;
  total_price_quota?: number;
  project_level_subscribers?: number;
  project_level_watches?: number;
  /** 失同步订阅人数：本地额度>0 但最近一次推送被微信 43101 拒收（需重新订阅） */
  out_of_sync_subscribers?: number;
}

interface MarketingStatsProps {
  stats: {
    total?: number;
    published?: number;
    draft?: number;
    for_sale?: number;
    sold?: number;
    in_progress?: number;
  };
  /** 订阅统计（P1-1；拉取失败时为 null，订阅两张卡隐藏不阻断项目卡） */
  subStats?: SubscriptionStats | null;
}

/** 营销项目统计卡（走共享 StatCardGrid，Steep 体系）。 */
export function MarketingStats({ stats, subStats }: MarketingStatsProps) {
  const items: StatItem[] = [
    {
      label: "全部项目",
      value: stats.total || 0,
      icon: <FileText className="h-4 w-4" />,
      dotColor: "bg-rust",
      warm: true,
    },
    {
      label: "已发布",
      value: stats.published || 0,
      icon: <Globe className="h-4 w-4" />,
      dotColor: "bg-rust",
      valueClassName: "text-rust",
    },
    {
      label: "草稿",
      value: stats.draft || 0,
      icon: <Eye className="h-4 w-4" />,
      dotColor: "bg-ink",
    },
    {
      label: "在售",
      value: stats.for_sale || 0,
      icon: <CheckCircle className="h-4 w-4" />,
      dotColor: "bg-rust",
      valueClassName: "text-rust",
    },
  ];

  // P1-1 订阅漏斗两卡：订阅用户（任一频道订阅过总人数）+ 可触达·新上（上新频道剩余额度>0）
  if (subStats) {
    const outOfSync = subStats.out_of_sync_subscribers ?? 0;
    items.push(
      {
        label: "订阅用户",
        value: subStats.total_subscribers ?? 0,
        icon: <Bell className="h-4 w-4" />,
        dotColor: "bg-ink",
        // 失同步提醒（43101 对账 · 仅标记提醒）：本地额度未消费但微信侧拒收，
        // 需引导用户在小程序内重新订阅（排查报告 2026-10-09 §5.2-3）
        trend:
          outOfSync > 0
            ? { text: `失同步 ${outOfSync} 人 · 需重新订阅`, tone: "down" }
            : undefined,
      },
      {
        label: "可触达·新上",
        value: subStats.new_listing_subscribers ?? 0,
        icon: <Zap className="h-4 w-4" />,
        dotColor: "bg-rust",
        valueClassName: "text-rust",
      },
    );
  }

  return <StatCardGrid items={items} columns={subStats ? 5 : 4} />;
}
