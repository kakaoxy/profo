import { FileSignature, Hammer, TrendingUp, CircleDollarSign } from "lucide-react";
import { StatCardGrid, type StatItem } from "@/app/(main)/admin/_components/stat-card-grid";

interface StatsProps {
  stats: {
    signing?: number;
    renovating?: number;
    selling?: number;
    sold?: number;
  };
}

/** 项目管理阶段统计卡（走共享 StatCardGrid，Steep 体系）。 */
export function ProjectStats({ stats }: StatsProps) {
  const items: StatItem[] = [
    {
      label: "签约",
      value: stats.signing || 0,
      icon: <FileSignature className="h-4 w-4" />,
      dotColor: "bg-ink",
    },
    {
      label: "装修",
      value: stats.renovating || 0,
      icon: <Hammer className="h-4 w-4" />,
      dotColor: "bg-ink",
    },
    {
      label: "在售",
      value: stats.selling || 0,
      icon: <TrendingUp className="h-4 w-4" />,
      dotColor: "bg-rust",
      warm: true,
    },
    {
      label: "已售",
      value: stats.sold || 0,
      icon: <CircleDollarSign className="h-4 w-4" />,
      dotColor: "bg-ink",
    },
  ];

  return <StatCardGrid items={items} />;
}
