import { StatsCardGrid, type StatItem } from "@/components/common";
import {
  FileText,
  Globe,
  Eye,
  CheckCircle,
} from "lucide-react";

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

export function MarketingStats({ stats }: MarketingStatsProps) {
  const items: StatItem[] = [
    {
      label: "全部项目",
      value: stats.total || 0,
      icon: FileText,
      color: "bg-on-surface",
    },
    {
      label: "已发布",
      value: stats.published || 0,
      icon: Globe,
      color: "bg-primary",
    },
    {
      label: "草稿",
      value: stats.draft || 0,
      icon: Eye,
      color: "bg-tertiary",
    },
    {
      label: "在售",
      value: stats.for_sale || 0,
      icon: CheckCircle,
      color: "bg-primary",
    },
  ];

  return <StatsCardGrid items={items} />;
}
