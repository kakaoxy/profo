import { StatsCardGrid, type StatItem } from "@/components/common";
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
  const items: StatItem[] = [
    {
      label: "签约",
      value: stats.signing || 0,
      icon: FileSignature,
      color: "bg-primary",
    },
    {
      label: "装修",
      value: stats.renovating || 0,
      icon: Hammer,
      color: "bg-tertiary",
    },
    {
      label: "在售",
      value: stats.selling || 0,
      icon: TrendingUp,
      color: "bg-on-surface",
    },
    {
      label: "已售",
      value: stats.sold || 0,
      icon: CircleDollarSign,
      color: "bg-primary",
    },
  ];

  return <StatsCardGrid items={items} />;
}
