import { FileText, Globe, Eye, CheckCircle } from "lucide-react";

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
    { label: "全部项目", value: stats.total || 0, icon: FileText, accent: false, warm: true },
    { label: "已发布", value: stats.published || 0, icon: Globe, accent: true, warm: false },
    { label: "草稿", value: stats.draft || 0, icon: Eye, accent: false, warm: false },
    { label: "在售", value: stats.for_sale || 0, icon: CheckCircle, accent: true, warm: false },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div
            key={item.label}
            className={`rounded-cards p-6 shadow-steep-sm ${item.warm ? "bg-apricot-wash" : "bg-white"}`}
          >
            <div className="flex items-center justify-between">
              <span className={`text-sm ${item.accent ? "text-rust" : "text-graphite"}`}>
                {item.label}
              </span>
              <Icon className={`h-4 w-4 ${item.accent ? "text-rust" : "text-graphite"}`} />
            </div>
            <div
              className={`mt-3 text-2xl font-medium tabular-nums ${item.accent ? "text-rust" : "text-ink"}`}
            >
              {item.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
