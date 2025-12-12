import { Card } from "@/components/ui/card";
import { 
  FileSignature, 
  Hammer, 
  Store, 
  BadgeCheck 
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
      // 蓝色：品牌色，代表起始
      color: "text-blue-600",
      bg: "bg-blue-50",
    },
    {
      label: "装修",
      value: stats.renovating || 0,
      icon: Hammer,
      // 橙色：代表工程、进行中
      color: "text-orange-600",
      bg: "bg-orange-50",
    },
    {
      label: "在售",
      value: stats.selling || 0,
      icon: Store,
      // 紫色：代表商业、高价值
      color: "text-purple-600",
      bg: "bg-purple-50",
    },
    {
      label: "已售",
      value: stats.sold || 0,
      icon: BadgeCheck,
      // 绿色：代表成功、收益
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
  ];

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
      {items.map((item, index) => {
        const Icon = item.icon;
        return (
          <Card 
            key={index} 
            // 核心修改：去除 border，使用 subtle shadow，增加 hover 动效
            className="flex items-center justify-between p-6 bg-white border-none shadow-[0_2px_10px_-3px_rgba(0,0,0,0.07)] hover:shadow-[0_8px_20px_-6px_rgba(0,0,0,0.12)] transition-all duration-300"
          >
            {/* 左侧：文字信息 */}
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-500 tracking-wide">
                {item.label}
              </p>
              <div className="text-4xl font-bold text-slate-800 tabular-nums font-sans">
                {item.value}
              </div>
            </div>
            
            {/* 右侧：大图标背景 */}
            <div className={`h-14 w-14 rounded-2xl flex items-center justify-center ${item.bg} ${item.color}`}>
              <Icon className="w-7 h-7" strokeWidth={2} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}