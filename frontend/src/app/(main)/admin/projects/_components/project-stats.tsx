import { FileSignature, Hammer, TrendingUp, CircleDollarSign } from "lucide-react";

interface StatsProps {
  stats: {
    signing?: number;
    renovating?: number;
    selling?: number;
    sold?: number;
  };
}

export function ProjectStats({ stats }: StatsProps) {
  const items = [
    { label: "签约", value: stats.signing || 0, icon: FileSignature, accent: false, warm: false },
    { label: "装修", value: stats.renovating || 0, icon: Hammer, accent: false, warm: false },
    { label: "在售", value: stats.selling || 0, icon: TrendingUp, accent: true, warm: true },
    { label: "已售", value: stats.sold || 0, icon: CircleDollarSign, accent: false, warm: false },
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
