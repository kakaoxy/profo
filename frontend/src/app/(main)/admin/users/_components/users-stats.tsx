"use client";

import { Users, UserCircle, TrendingUp, Activity } from "lucide-react";
import { StatCardGrid, type StatItem } from "@/app/(main)/admin/_components/stat-card-grid";
import type { UserResponse } from "../actions/index";

interface UsersStatCardsProps {
  internalItems: UserResponse[];
  customerItems: UserResponse[];
}

/**
 * 用户管理页统计卡片区块（走共享 StatCardGrid，Steep 体系）。
 * 颜色仅通过标签圆点区分（Rust / Sky Wash / Apricot Wash / Ink），无页面私有 KPI 样式。
 */
export function UsersStatCards({ internalItems, customerItems }: UsersStatCardsProps) {
  const internalTotal = internalItems.length;
  const customerTotal = customerItems.length;
  const internalActive = internalItems.filter((u) => u.status === "active").length;
  const customerActive = customerItems.filter((u) => u.status === "active").length;
  const internalLeads = internalItems.reduce((s, u) => s + (u.leads_count || 0), 0);
  const customerLeads = customerItems.reduce((s, u) => s + (u.leads_count || 0), 0);
  const totalLeads = internalLeads + customerLeads;
  const activeSubmitters = [...internalItems, ...customerItems].filter(
    (u) => (u.leads_count || 0) > 0,
  ).length;
  const totalUsers = internalTotal + customerTotal;
  const avgLeads = totalUsers > 0 ? (totalLeads / totalUsers).toFixed(1) : "0.0";
  const submitterRatio = totalUsers > 0 ? Math.round((activeSubmitters / totalUsers) * 100) : 0;

  const items: StatItem[] = [
    {
      dotColor: "bg-rust",
      label: "内部用户",
      value: internalTotal,
      unit: "人",
      icon: <Users className="h-4 w-4" />,
      trend: {
        text: (
          <>
            活跃 <span className="text-ink">{internalActive}</span> · 累计线索{" "}
            <span className="text-ink">{internalLeads}</span>
          </>
        ),
      },
    },
    {
      dotColor: "bg-sky-wash",
      label: "C 端用户",
      value: customerTotal,
      unit: "人",
      icon: <UserCircle className="h-4 w-4" />,
      trend: {
        text: (
          <>
            活跃 <span className="text-ink">{customerActive}</span> · 累计线索{" "}
            <span className="text-ink">{customerLeads}</span>
          </>
        ),
      },
    },
    {
      dotColor: "bg-apricot-wash",
      label: "累计线索",
      value: totalLeads,
      unit: "条",
      icon: <TrendingUp className="h-4 w-4" />,
      trend: {
        text: (
          <>
            人均 <span className="text-ink">{avgLeads}</span> 条
          </>
        ),
      },
    },
    {
      dotColor: "bg-ink",
      label: "活跃提交者",
      value: activeSubmitters,
      unit: "人",
      icon: <Activity className="h-4 w-4" />,
      trend: {
        text: (
          <>
            占比 <span className="text-ink">{submitterRatio}%</span>
          </>
        ),
      },
    },
  ];

  return <StatCardGrid items={items} />;
}
