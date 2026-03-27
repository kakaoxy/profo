"use client";

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
    {
      label: "全部项目",
      value: stats.total || 0,
      icon: FileText,
      color: "bg-[#707785]",
      lightColor: "bg-[#707785]/10",
      textColor: "text-[#707785]",
    },
    {
      label: "已发布",
      value: stats.published || 0,
      icon: Globe,
      color: "bg-[#266d00]",
      lightColor: "bg-[#85fa51]/20",
      textColor: "text-[#266d00]",
    },
    {
      label: "草稿",
      value: stats.draft || 0,
      icon: Eye,
      color: "bg-[#7d5400]",
      lightColor: "bg-[#ffddb0]/30",
      textColor: "text-[#7d5400]",
    },
    {
      label: "在售",
      value: stats.for_sale || 0,
      icon: CheckCircle,
      color: "bg-[#005daa]",
      lightColor: "bg-[#a5c8ff]/30",
      textColor: "text-[#005daa]",
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <div
            key={index}
            className={`${item.lightColor} rounded-2xl p-5 hover:shadow-md transition-all cursor-pointer border border-transparent hover:border-[#c0c7d6]/20`}
            role="button"
            aria-label={`${item.label} ${item.value}`}
          >
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className={`text-xs font-bold uppercase tracking-wider ${item.textColor}`}>
                  {item.label}
                </p>
                <p className="text-2xl font-extrabold text-[#0b1c30] tabular-nums">
                  {item.value}
                </p>
              </div>
              <div
                className={`h-12 w-12 rounded-xl flex items-center justify-center ${item.color} text-white shadow-lg`}
                aria-hidden="true"
              >
                <Icon className="w-6 h-6" strokeWidth={1.5} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
