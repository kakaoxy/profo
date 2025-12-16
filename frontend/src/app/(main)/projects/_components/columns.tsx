"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LineChart } from "lucide-react";
import { toast } from "sonner";
import { Project } from "../types";

const formatMoney = (value: number | undefined | null) => {
  if (value === undefined || value === null) return "-";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
  }).format(value);
};

const formatWan = (value: number | string | undefined | null) => {
  if (!value) return "-";
  return `${value}`;
};

// 🎨 优化配色：无边框风格，色彩更纯粹
const statusConfig: Record<string, { label: string; className: string }> = {
  signing: {
    label: "签约",
    // 使用纯色背景 + 白色文字
    className: "bg-blue-500 text-white hover:bg-blue-600",
  },
  renovating: {
    label: "装修",
    // 使用纯色背景 + 白色文字
    className: "bg-orange-500 text-white hover:bg-orange-600",
  },
  selling: {
    label: "在售",
    // 使用中灰背景 + 浅灰色文字（不同于其他状态）
    className: "bg-emerald-500 text-white hover:bg-emerald-600",
  },
  sold: {
    label: "已售",
    // 使用纯色背景 + 白色文字
    className: "bg-slate-300 text-slate-700 hover:bg-slate-400",
  },
};
export const columns: ColumnDef<Project>[] = [
  {
    accessorKey: "name",
    header: "项目名称 / ID",
    cell: ({ row }) => {
      // 移动端布局逻辑保持不变，重点优化样式
      const status = row.original.status || "signing";
      const config = statusConfig[status];

      return (
        <div className="flex flex-col py-1 min-w-[140px]">
          <span className="font-bold text-slate-800 text-[15px] truncate max-w-[200px] md:max-w-xs">
            {row.original.name}
          </span>

          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] text-slate-400 font-mono tracking-tight">
              ID: {row.original.id.slice(0, 8)}
            </span>
            <Badge
              variant="secondary"
              className={`md:hidden text-[10px] px-1.5 py-0 h-5 border-none rounded-lg ${config?.className}`}
            >
              {config?.label}
            </Badge>
          </div>
        </div>
      );
    },
  },
  {
    accessorKey: "community_name",
    header: () => (
      <div className="hidden lg:block text-slate-500 font-medium">小区</div>
    ),
    cell: ({ row }) => (
      <span className="hidden lg:block text-sm text-slate-600 font-medium truncate max-w-[120px]">
        {row.original.community_name || "-"}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: () => (
      <div className="hidden md:block pl-2 text-slate-500 font-medium">
        状态
      </div>
    ),
    cell: ({ row }) => {
      const status = row.original.status || "signing";
      const config = statusConfig[status] || {
        label: status,
        className: "bg-slate-100 text-slate-600",
      };

      return (
        <div className="hidden md:block">
          {/* 这里去掉了 border，使用了更圆润的 pill 形状 */}
          <Badge
            variant="secondary" // 使用 secondary 变体去除默认的黑色边框
            className={`px-3 py-1 text-xs font-semibold rounded-lg border-none shadow-none ${config.className}`}
          >
            {config.label}
          </Badge>
        </div>
      );
    },
  },
  {
    accessorKey: "signing_price",
    header: () => (
      <div className="hidden sm:block text-right pr-4 text-slate-500 font-medium">
        签约价(万)
      </div>
    ),
    cell: ({ row }) => (
      <div className="hidden sm:block text-right pr-4 font-semibold text-slate-700 tabular-nums">
        {formatWan(row.original.signing_price)}
      </div>
    ),
  },
  {
    accessorKey: "soldPrice",
    header: () => (
      <div className="hidden sm:block text-right pr-4 text-slate-500 font-medium">
        成交价(万)
      </div>
    ),
    cell: ({ row }) => (
      <div className="hidden sm:block text-right pr-4 font-semibold text-slate-700 tabular-nums">
        {formatWan(row.original.soldPrice)}
      </div>
    ),
  },
  {
    accessorKey: "manager",
    header: () => (
      <div className="hidden xl:block text-slate-500 font-medium">负责人</div>
    ),
    cell: ({ row }) => (
      <div className="hidden xl:flex items-center gap-2">
        <span className="text-sm text-slate-600 font-medium bg-slate-50 px-2 py-1 rounded-md">
          {row.original.manager || "-"}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "net_cash_flow",
    header: () => (
      <div className="hidden lg:block text-right text-slate-500 font-medium">
        现金流
      </div>
    ),
    cell: ({ row }) => {
      const val = row.original.net_cash_flow || 0;
      // 颜色逻辑：蓝色代表正向，灰色代表0，红色代表负向（更符合财务直觉）
      let colorClass = "text-slate-400";
      if (val > 0) colorClass = "text-blue-600";
      if (val < 0) colorClass = "text-rose-600";

      return (
        <div
          className={`hidden lg:block text-right font-bold cursor-pointer hover:opacity-80 tabular-nums ${colorClass}`}
          onClick={(e) => {
            e.stopPropagation();
            toast.info(`查看「${row.original.name}」资金流水`);
          }}
        >
          {formatMoney(val)}
        </div>
      );
    },
  },
  {
    id: "actions",
    header: "操作",
    cell: ({ row }) => {
      return (
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 h-8 px-3 flex items-center gap-1.5 transition-all rounded-full"
          onClick={(e) => {
            e.stopPropagation();
            toast.info(`正在跳转`, {
              description: `即将进入 ${row.original.name} 的数据监控面板`,
            });
          }}
        >
          <LineChart className="h-3.5 w-3.5" />
          <span className="hidden sm:inline text-xs font-medium">监控</span>
        </Button>
      );
    },
  },
];
