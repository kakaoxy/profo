"use client";

import { Users, UserCircle, TrendingUp, Activity } from "lucide-react";
import type { UserResponse } from "../actions/index";

interface UsersStatCardsProps {
  internalItems: UserResponse[];
  customerItems: UserResponse[];
}

/**
 * 用户管理页统计卡片区块。
 * 颜色由 .users-stat-card 的变体类（warm/success/默认）驱动，
 * 子元素通过 .stat-label/.stat-value/.stat-meta/.stat-meta-value/.stat-icon/.stat-unit
 * 继承对应颜色，避免内联样式。
 */
export function UsersStatCards({
  internalItems,
  customerItems,
}: UsersStatCardsProps) {
  const internalTotal = internalItems.length;
  const customerTotal = customerItems.length;
  const internalActive = internalItems.filter(
    (u) => u.status === "active",
  ).length;
  const customerActive = customerItems.filter(
    (u) => u.status === "active",
  ).length;
  const internalLeads = internalItems.reduce(
    (s, u) => s + (u.leads_count || 0),
    0,
  );
  const customerLeads = customerItems.reduce(
    (s, u) => s + (u.leads_count || 0),
    0,
  );
  const totalLeads = internalLeads + customerLeads;
  const activeSubmitters = [...internalItems, ...customerItems].filter(
    (u) => (u.leads_count || 0) > 0,
  ).length;
  const totalUsers = internalTotal + customerTotal;
  const avgLeads =
    totalUsers > 0 ? (totalLeads / totalUsers).toFixed(1) : "0.0";
  const submitterRatio =
    totalUsers > 0 ? Math.round((activeSubmitters / totalUsers) * 100) : 0;

  return (
    <div className="users-stat-grid">
      {/* Internal users (warm) */}
      <div className="users-stat-card warm">
        <div className="flex items-center justify-between mb-1">
          <span className="stat-label text-xs font-semibold uppercase tracking-wider">
            内部用户
          </span>
          <Users className="stat-icon h-3.5 w-3.5" />
        </div>
        <div className="stat-value text-2xl font-bold tabular-nums">
          {internalTotal}
          <span className="stat-unit text-sm font-medium ml-1">人</span>
        </div>
        <div className="stat-meta text-xs mt-1">
          活跃 <span className="stat-meta-value">{internalActive}</span>
          {" · "}
          累计线索 <span className="stat-meta-value">{internalLeads}</span>
        </div>
      </div>

      {/* Customer users (success/green) */}
      <div className="users-stat-card success">
        <div className="flex items-center justify-between mb-1">
          <span className="stat-label text-xs font-semibold uppercase tracking-wider">
            C 端用户
          </span>
          <UserCircle className="stat-icon h-3.5 w-3.5" />
        </div>
        <div className="stat-value text-2xl font-bold tabular-nums">
          {customerTotal}
          <span className="stat-unit text-sm font-medium ml-1">人</span>
        </div>
        <div className="stat-meta text-xs mt-1">
          活跃 <span className="stat-meta-value">{customerActive}</span>
          {" · "}
          累计线索 <span className="stat-meta-value">{customerLeads}</span>
        </div>
      </div>

      {/* Total leads (neutral) */}
      <div className="users-stat-card">
        <div className="flex items-center justify-between mb-1">
          <span className="stat-label text-xs font-semibold uppercase tracking-wider">
            累计线索
          </span>
          <TrendingUp className="stat-icon h-3.5 w-3.5" />
        </div>
        <div className="stat-value text-2xl font-bold tabular-nums">
          {totalLeads}
          <span className="stat-unit text-sm font-medium ml-1">条</span>
        </div>
        <div className="stat-meta text-xs mt-1">
          人均 <span className="stat-meta-value">{avgLeads}</span> 条
        </div>
      </div>

      {/* Active submitters (neutral) */}
      <div className="users-stat-card">
        <div className="flex items-center justify-between mb-1">
          <span className="stat-label text-xs font-semibold uppercase tracking-wider">
            活跃提交者
          </span>
          <Activity className="stat-icon h-3.5 w-3.5" />
        </div>
        <div className="stat-value text-2xl font-bold tabular-nums">
          {activeSubmitters}
          <span className="stat-unit text-sm font-medium ml-1">人</span>
        </div>
        <div className="stat-meta text-xs mt-1">
          占比 <span className="stat-meta-value">{submitterRatio}%</span>
        </div>
      </div>
    </div>
  );
}
