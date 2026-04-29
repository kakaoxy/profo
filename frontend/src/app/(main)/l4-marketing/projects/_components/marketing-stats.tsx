import { Card } from "@/components/ui/card";
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
  const items = [
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

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <Card
            key={index}
            className="p-4 bg-card border-border hover:bg-muted dark:hover:bg-muted transition-colors cursor-pointer shadow-sm"
            role="button"
            aria-label={`${item.label} ${item.value}`}
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">
                  {item.label}
                </p>
                <p className="text-2xl font-bold text-foreground tabular-nums">
                  {item.value}
                </p>
              </div>
              <div
                className={`h-10 w-10 rounded-full flex items-center justify-center ${item.color} text-white`}
                aria-hidden="true"
              >
                <Icon className="w-5 h-5" strokeWidth={1.75} />
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
