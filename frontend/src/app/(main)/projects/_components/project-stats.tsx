import { Card } from "@/components/ui/card";
import {
  FileSignature,
  Hammer,
  TrendingUp,
  CircleDollarSign,
} from "lucide-react";

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
    {
      label: "签约",
      value: stats.signing || 0,
      icon: FileSignature,
      color: "bg-blue-500",
    },
    {
      label: "装修",
      value: stats.renovating || 0,
      icon: Hammer,
      color: "bg-amber-500",
    },
    {
      label: "在售",
      value: stats.selling || 0,
      icon: TrendingUp,
      color: "bg-emerald-500",
    },
    {
      label: "已售",
      value: stats.sold || 0,
      icon: CircleDollarSign,
      color: "bg-purple-500",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <Card
            key={index}
            className="p-4 hover:bg-slate-50 transition-colors cursor-pointer"
            role="button"
            aria-label={`${item.label} ${item.value}`}
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-500">
                  {item.label}
                </p>
                <p className="text-2xl font-bold text-slate-800 tabular-nums">
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
