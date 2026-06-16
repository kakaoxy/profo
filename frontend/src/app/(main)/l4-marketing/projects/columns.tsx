"use client";

import { ColumnDef } from "@tanstack/react-table";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { L4MarketingProject, MARKETING_PROJECT_STATUS_CONFIG, PUBLISH_STATUS_CONFIG } from "./types";
import { getFileUrl } from "@/lib/config";
import { isValidUrl } from "@/lib/validators";
import { formatPrice, formatUnitPrice, formatArea, safeFormatDate } from "@/lib/formatters";
import { getProjectStatusClassName } from "@/lib/status-colors";
import { ActionCell } from "./_components/action-cell";

// 判断是否为开发环境
const isDev = process.env.NODE_ENV === "development";

// 使用 types.ts 中定义的状态配置，className 通过 getProjectStatusClassName 统一获取
const statusConfig: Record<string, { label: string }> = {
  "在途": {
    label: MARKETING_PROJECT_STATUS_CONFIG["在途"].label,
  },
  "在售": {
    label: MARKETING_PROJECT_STATUS_CONFIG["在售"].label,
  },
  "已售": {
    label: MARKETING_PROJECT_STATUS_CONFIG["已售"].label,
  },
};

const publishStatusConfig: Record<string, { label: string; className: string }> = {
  "草稿": {
    label: PUBLISH_STATUS_CONFIG["草稿"].label,
    className: "bg-status-pending text-white hover:bg-status-pending/90",
  },
  "发布": {
    label: PUBLISH_STATUS_CONFIG["发布"].label,
    className: "bg-status-selling text-white hover:bg-status-selling/90",
  },
};

export const columns: ColumnDef<L4MarketingProject>[] = [
  {
    accessorKey: "title",
    header: "房源信息",
    cell: ({ row }) => {
      const project = row.original;

      // 优先从 media_files 获取营销图片，如果没有则使用 images 字段
      let imageUrl: string | null = null;
      if (project.media_files && project.media_files.length > 0) {
        // 获取第一张营销图片，优先使用 thumbnail_url
        const firstMedia = project.media_files[0];
        imageUrl = getFileUrl(firstMedia.thumbnail_url || firstMedia.file_url);
      } else if (Array.isArray(project.images) && project.images.length > 0) {
        // 回退到 images 字段 - 后端直接返回数组
        imageUrl = getFileUrl(project.images[0]);
      }

      const status = project.project_status || "在途";
      const config = statusConfig[status] || { label: status };
      const statusClassName = getProjectStatusClassName(status);

      return (
        <div className="flex items-center gap-4 py-1 min-w-[180px]">
          {imageUrl && isValidUrl(imageUrl) ? (
            <div className="relative w-20 h-14 rounded-lg shrink-0 border border-border overflow-hidden">
              {isDev ? (
                // eslint-disable-next-line @next/next/no-img-element
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
            <div className="w-20 h-14 rounded-lg bg-muted flex items-center justify-center text-xs text-muted-foreground shrink-0 border border-border">
              无图
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-foreground text-[15px] truncate max-w-[200px] md:max-w-xs">
              {project.title || "未命名项目"}
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] text-muted-foreground font-mono tracking-tight">
                ID: {project.id}
              </span>
              <Badge
                variant="secondary"
                className={`md:hidden text-[10px] px-1.5 py-0 h-5 border-none rounded-lg ${statusClassName}`}
              >
                {config?.label}
              </Badge>
              <span className="text-[11px] text-muted-foreground">
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
      <div className="hidden md:block text-muted-foreground font-medium">户型</div>
    ),
    cell: ({ row }) => (
      <div className="hidden md:block">
        <div className="text-sm font-medium text-foreground">{row.original.layout || "-"}</div>
        <div className="text-xs text-muted-foreground">{formatArea(row.original.area)}</div>
      </div>
    ),
  },

  {
    accessorKey: "orientation",
    header: () => (
      <div className="hidden md:block text-muted-foreground font-medium">朝向</div>
    ),
    cell: ({ row }) => (
      <span className="hidden md:block text-sm text-foreground">
        {row.original.orientation || "-"}
      </span>
    ),
  },

  {
    accessorKey: "floor_info",
    header: () => (
      <div className="hidden lg:block text-muted-foreground font-medium">楼层</div>
    ),
    cell: ({ row }) => (
      <span className="hidden lg:block text-sm text-foreground">
        {row.original.floor_info || "-"}
      </span>
    ),
  },

  {
    accessorKey: "total_price",
    header: () => (
      <div className="hidden sm:block text-right pr-4 text-muted-foreground font-medium">
        总价
      </div>
    ),
    cell: ({ row }) => (
      <div className="hidden sm:block text-right pr-4">
        <div className="font-semibold text-foreground tabular-nums">
          {formatPrice(row.original.total_price)}
        </div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {formatUnitPrice(row.original.unit_price)}
        </div>
      </div>
    ),
  },

  {
    accessorKey: "project_status",
    header: () => (
      <div className="hidden md:block pl-2 text-muted-foreground font-medium">
        项目状态
      </div>
    ),
    cell: ({ row }) => {
      const status = row.original.project_status || "在途";
      const config = statusConfig[status] || { label: status };
      const statusClassName = getProjectStatusClassName(status);

      return (
        <div className="hidden md:block">
          <Badge
            variant="secondary"
            className={`px-3 py-1 text-xs font-semibold rounded-lg border-none shadow-none ${statusClassName}`}
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
      <div className="hidden lg:block text-muted-foreground font-medium">发布状态</div>
    ),
    cell: ({ row }) => {
      const publishStatus = row.original.publish_status || "草稿";
      const config = publishStatusConfig[publishStatus] || {
        label: publishStatus,
        className: "bg-muted text-muted-foreground",
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
      <div className="hidden xl:block text-muted-foreground font-medium">更新时间</div>
    ),
    cell: ({ row }) => {
      const date = row.original.updated_at;
      return (
        <span className="hidden xl:block text-sm text-muted-foreground">
          {safeFormatDate(date, "yyyy/MM/dd HH:mm")}
        </span>
      );
    },
  },

  {
    id: "actions",
    header: () => <div className="text-right pr-4 text-muted-foreground font-medium">操作</div>,
    cell: ({ row }) => <ActionCell project={row.original} />,
  },
];
