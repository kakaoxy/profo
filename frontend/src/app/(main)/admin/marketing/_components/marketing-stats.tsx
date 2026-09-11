import { FileText, Globe, Eye, CheckCircle } from "lucide-react";
import { StatCardGrid, type StatItem } from "@/app/(main)/admin/_components/stat-card-grid";

interface MarketingStatsProps {
  stats: {
    total?: number;
    published?: number;
    draft?: number;
    for_sale?: number;
    sold?: number;
    in_progress?: number;
  };
}

/** 营销项目统计卡（走共享 StatCardGrid，Steep 体系）。 */
export function MarketingStats({ stats }: MarketingStatsProps) {
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

  return <StatCardGrid items={items} />;
}
