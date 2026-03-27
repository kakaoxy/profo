"use client";

import { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { L4MarketingProject, MARKETING_PROJECT_STATUS_CONFIG, PUBLISH_STATUS_CONFIG } from "./types";
import { getFileUrl } from "@/lib/config";
import { formatPrice, formatUnitPrice, formatArea } from "@/lib/formatters";
import { ActionCell } from "./_components/action-cell";

export const columns: ColumnDef<L4MarketingProject>[] = [
  {
    accessorKey: "title",
    header: "房源信息",
    cell: ({ row }) => {
      const project = row.original;
      const images = project.images?.split(",") || [];
      const coverImage = images[0];
      const status = project.project_status || "在途";
      const config = MARKETING_PROJECT_STATUS_CONFIG[status as keyof typeof MARKETING_PROJECT_STATUS_CONFIG] || {
        label: status,
        color: "#707785",
        bgColor: "#f3f4f6",
      };

      return (
        <div className="flex items-center gap-4 py-1 min-w-[180px]">
          {coverImage ? (
            <img
              src={getFileUrl(coverImage.trim())}
              alt="封面"
              className="w-20 h-14 rounded-lg object-cover flex-shrink-0 border border-[#c0c7d6]/20"
            />
          ) : (
            <div className="w-20 h-14 rounded-lg bg-[#eff4ff] flex items-center justify-center text-[10px] text-[#707785] flex-shrink-0 border border-[#c0c7d6]/20">
              无图
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-[#0b1c30] text-[15px] truncate max-w-[200px] md:max-w-xs">
              {project.title || "未命名项目"}
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] text-[#707785] font-mono tracking-tight">
                ID: {project.id}
              </span>
              <span className="text-[11px] text-[#707785]">
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
      <div className="hidden md:block text-[#707785] font-bold text-xs uppercase tracking-wider">户型</div>
    ),
    cell: ({ row }) => (
      <div className="hidden md:block">
        <div className="text-sm font-medium text-[#0b1c30]">{row.original.layout || "-"}</div>
        <div className="text-xs text-[#707785]">{formatArea(row.original.area)}</div>
      </div>
    ),
  },

  {
    accessorKey: "orientation",
    header: () => (
      <div className="hidden md:block text-[#707785] font-bold text-xs uppercase tracking-wider">朝向</div>
    ),
    cell: ({ row }) => (
      <span className="hidden md:block text-sm text-[#0b1c30]">
        {row.original.orientation || "-"}
      </span>
    ),
  },

  {
    accessorKey: "floor_info",
    header: () => (
      <div className="hidden lg:block text-[#707785] font-bold text-xs uppercase tracking-wider">楼层</div>
    ),
    cell: ({ row }) => (
      <span className="hidden lg:block text-sm text-[#0b1c30]">
        {row.original.floor_info || "-"}
      </span>
    ),
  },

  {
    accessorKey: "total_price",
    header: () => (
      <div className="hidden sm:block text-right pr-4 text-[#707785] font-bold text-xs uppercase tracking-wider">
        总价
      </div>
    ),
    cell: ({ row }) => (
      <div className="hidden sm:block text-right pr-4">
        <div className="font-bold text-[#005daa] tabular-nums">
          {formatPrice(row.original.total_price)}
        </div>
        <div className="text-xs text-[#707785] tabular-nums">
          {formatUnitPrice(row.original.unit_price)}
        </div>
      </div>
    ),
  },

  {
    accessorKey: "project_status",
    header: () => (
      <div className="hidden md:block pl-2 text-[#707785] font-bold text-xs uppercase tracking-wider">
        项目状态
      </div>
    ),
    cell: ({ row }) => {
      const status = row.original.project_status || "在途";
      const config = MARKETING_PROJECT_STATUS_CONFIG[status as keyof typeof MARKETING_PROJECT_STATUS_CONFIG] || {
        label: status,
        color: "#707785",
        bgColor: "#f3f4f6",
      };

      return (
        <div className="hidden md:block">
          <span
            className="inline-flex items-center px-3 py-1.5 rounded-full text-[11px] font-bold"
            style={{
              backgroundColor: config.bgColor,
              color: config.color,
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full mr-2"
              style={{ backgroundColor: config.color }}
            ></span>
            {config.label}
          </span>
        </div>
      );
    },
  },

  {
    accessorKey: "publish_status",
    header: () => (
      <div className="hidden lg:block text-[#707785] font-bold text-xs uppercase tracking-wider">发布状态</div>
    ),
    cell: ({ row }) => {
      const publishStatus = row.original.publish_status || "草稿";
      const config = PUBLISH_STATUS_CONFIG[publishStatus as keyof typeof PUBLISH_STATUS_CONFIG] || PUBLISH_STATUS_CONFIG["草稿"];

      return (
        <div className="hidden lg:block">
          <span
            className="inline-flex items-center px-3 py-1.5 rounded-full text-[11px] font-bold"
            style={{
              backgroundColor: config.bgColor,
              color: config.color,
            }}
          >
            {config.label}
          </span>
        </div>
      );
    },
  },

  {
    accessorKey: "updated_at",
    header: () => (
      <div className="hidden xl:block text-[#707785] font-bold text-xs uppercase tracking-wider">更新时间</div>
    ),
    cell: ({ row }) => {
      const date = row.original.updated_at;
      return (
        <span className="hidden xl:block text-sm text-[#707785]">
          {date ? format(new Date(date), "yyyy/MM/dd HH:mm") : "-"}
        </span>
      );
    },
  },

  {
    id: "actions",
    header: () => <div className="text-right pr-4 text-[#707785] font-bold text-xs uppercase tracking-wider">操作</div>,
    cell: ({ row }) => <ActionCell project={row.original} />,
  },
];
