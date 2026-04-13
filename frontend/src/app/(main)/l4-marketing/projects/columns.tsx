"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { L4MarketingProject, MARKETING_PROJECT_STATUS_CONFIG, PUBLISH_STATUS_CONFIG } from "./types";
import { getFileUrl } from "@/lib/config";
import { formatPrice, formatUnitPrice, formatArea } from "@/lib/formatters";
import { ActionCell } from "./_components/action-cell";

// 判断是否为开发环境
const isDev = process.env.NODE_ENV === "development";

// 使用 types.ts 中定义的状态配置，转换为 Badge 所需的 className 格式
const statusConfig: Record<string, { label: string; className: string }> = {
  "在途": {
    label: MARKETING_PROJECT_STATUS_CONFIG["在途"].label,
    className: "bg-blue-500 text-white hover:bg-blue-600",
  },
  "在售": {
    label: MARKETING_PROJECT_STATUS_CONFIG["在售"].label,
    className: "bg-emerald-500 text-white hover:bg-emerald-600",
  },
  "已售": {
    label: MARKETING_PROJECT_STATUS_CONFIG["已售"].label,
    className: "bg-slate-300 text-slate-700 hover:bg-slate-400",
  },
};

const publishStatusConfig: Record<string, { label: string; className: string }> = {
  "草稿": {
    label: PUBLISH_STATUS_CONFIG["草稿"].label,
    className: "bg-amber-500 text-white hover:bg-amber-600",
  },
  "发布": {
    label: PUBLISH_STATUS_CONFIG["发布"].label,
    className: "bg-emerald-500 text-white hover:bg-emerald-600",
  },
};

export const columns: ColumnDef<L4MarketingProject>[] = [
  {
    accessorKey: "title",
    header: "房源信息",
    cell: ({ row }) => {
      const project = row.original;
      const images = project.images?.split(",") || [];
      const coverImage = images[0];
      const status = project.project_status || "在途";
      const config = statusConfig[status] || {
        label: status,
        className: "bg-slate-100 text-slate-600",
      };

      const imageUrl = coverImage ? getFileUrl(coverImage.trim()) : null;

      return (
        <div className="flex items-center gap-4 py-1 min-w-[180px]">
          {imageUrl ? (
            <div className="relative w-20 h-14 rounded-lg flex-shrink-0 border border-slate-200 overflow-hidden">
              {isDev ? (
                <img
                  src={imageUrl}
                  alt="封面"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Image
                  src={imageUrl}
                  alt="封面"
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              )}
            </div>
          ) : (
            <div className="w-20 h-14 rounded-lg bg-slate-100 flex items-center justify-center text-xs text-slate-400 flex-shrink-0 border border-slate-200">
              无图
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-slate-800 text-[15px] truncate max-w-[200px] md:max-w-xs">
              {project.title || "未命名项目"}
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] text-slate-400 font-mono tracking-tight">
                ID: {project.id}
              </span>
              <Badge
                variant="secondary"
                className={`md:hidden text-[10px] px-1.5 py-0 h-5 border-none rounded-lg ${config?.className}`}
              >
                {config?.label}
              </Badge>
              <span className="text-[11px] text-slate-500">
                {project.community_name || "未知小区"}
              </span>
            </div>
          </div>
        </div>
      );
    },
  },

  {
    accessorKey: "layout",
    header: () => (
      <div className="hidden md:block text-slate-500 font-medium">户型</div>
    ),
    cell: ({ row }) => (
      <div className="hidden md:block">
        <div className="text-sm font-medium text-slate-700">{row.original.layout || "-"}</div>
        <div className="text-xs text-slate-500">{formatArea(row.original.area)}</div>
      </div>
    ),
  },

  {
    accessorKey: "orientation",
    header: () => (
      <div className="hidden md:block text-slate-500 font-medium">朝向</div>
    ),
    cell: ({ row }) => (
      <span className="hidden md:block text-sm text-slate-700">
        {row.original.orientation || "-"}
      </span>
    ),
  },

  {
    accessorKey: "floor_info",
    header: () => (
      <div className="hidden lg:block text-slate-500 font-medium">楼层</div>
    ),
    cell: ({ row }) => (
      <span className="hidden lg:block text-sm text-slate-700">
        {row.original.floor_info || "-"}
      </span>
    ),
  },

  {
    accessorKey: "total_price",
    header: () => (
      <div className="hidden sm:block text-right pr-4 text-slate-500 font-medium">
        总价
      </div>
    ),
    cell: ({ row }) => (
      <div className="hidden sm:block text-right pr-4">
        <div className="font-semibold text-slate-700 tabular-nums">
          {formatPrice(row.original.total_price)}
        </div>
        <div className="text-xs text-slate-500 tabular-nums">
          {formatUnitPrice(row.original.unit_price)}
        </div>
      </div>
    ),
  },

  {
    accessorKey: "project_status",
    header: () => (
      <div className="hidden md:block pl-2 text-slate-500 font-medium">
        项目状态
      </div>
    ),
    cell: ({ row }) => {
      const status = row.original.project_status || "在途";
      const config = statusConfig[status] || {
        label: status,
        className: "bg-slate-100 text-slate-600",
      };

      return (
        <div className="hidden md:block">
          <Badge
            variant="secondary"
            className={`px-3 py-1 text-xs font-semibold rounded-lg border-none shadow-none ${config.className}`}
          >
            {config.label}
          </Badge>
        </div>
      );
    },
  },

  {
    accessorKey: "publish_status",
    header: () => (
      <div className="hidden lg:block text-slate-500 font-medium">发布状态</div>
    ),
    cell: ({ row }) => {
      const publishStatus = row.original.publish_status || "草稿";
      const config = publishStatusConfig[publishStatus] || {
        label: publishStatus,
        className: "bg-slate-100 text-slate-600",
      };

      return (
        <div className="hidden lg:block">
          <Badge
            variant="secondary"
            className={`px-3 py-1 text-xs font-semibold rounded-lg border-none shadow-none ${config.className}`}
          >
            {config.label}
          </Badge>
        </div>
      );
    },
  },

  {
    accessorKey: "updated_at",
    header: () => (
      <div className="hidden xl:block text-slate-500 font-medium">更新时间</div>
    ),
    cell: ({ row }) => {
      const date = row.original.updated_at;
      return (
        <span className="hidden xl:block text-sm text-slate-500">
          {date ? format(new Date(date), "yyyy/MM/dd HH:mm") : "-"}
        </span>
      );
    },
  },

  {
    id: "actions",
    header: () => <div className="text-right pr-4 text-slate-500 font-medium">操作</div>,
    cell: ({ row }) => <ActionCell project={row.original} />,
  },
];
