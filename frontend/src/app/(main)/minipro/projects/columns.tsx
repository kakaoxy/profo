"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Eye } from "lucide-react";
import Link from "next/link";
import { L4MarketingProject, MARKETING_PROJECT_STATUS_CONFIG, PUBLISH_STATUS_CONFIG } from "./types";
import { getFileUrl } from "@/lib/config";
import { format } from "date-fns";
import { deleteL4MarketingProjectAction } from "./actions";
import { toast } from "sonner";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// 价格格式化
const formatPrice = (value: string | number | undefined | null) => {
  if (value === undefined || value === null) return "-";
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "-";
  return `¥${(numValue).toLocaleString()}万`;
};

// 单价格式化
const formatUnitPrice = (value: string | number | undefined | null) => {
  if (value === undefined || value === null) return "-";
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "-";
  return `¥${numValue.toLocaleString()}/㎡`;
};

// 面积格式化
const formatArea = (value: string | number | undefined | null) => {
  if (value === undefined || value === null) return "-";
  const numValue = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(numValue)) return "-";
  return `${numValue.toLocaleString()} m²`;
};

// Action Cell Component
const ActionCell = ({ project }: { project: L4MarketingProject }) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await deleteL4MarketingProjectAction(project.id);
      if (res.success) {
        toast.success("项目已删除");
      } else {
        toast.error(res.error || "删除失败");
      }
    } catch {
      toast.error("删除失败");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Link href={`/minipro/projects/${project.id}/preview`}>
        <Button
          variant="ghost"
          size="sm"
          className="text-[#707785] hover:text-[#005daa] hover:bg-[#a5c8ff]/20 h-8 w-8 sm:w-auto sm:px-2 p-0 flex items-center justify-center gap-1 transition-all rounded-lg"
        >
          <Eye className="h-3.5 w-3.5" />
          <span className="hidden lg:inline text-xs font-medium">预览</span>
        </Button>
      </Link>

      <Link href={`/minipro/projects/${project.id}/edit`}>
        <Button
          variant="ghost"
          size="sm"
          className="text-[#707785] hover:text-[#005daa] hover:bg-[#a5c8ff]/20 h-8 w-8 sm:w-auto sm:px-2 p-0 flex items-center justify-center gap-1 transition-all rounded-lg"
        >
          <Pencil className="h-3.5 w-3.5" />
          <span className="hidden lg:inline text-xs font-medium">编辑</span>
        </Button>
      </Link>

      <div className="hidden sm:block">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-[#707785] hover:text-[#ba1a1a] hover:bg-[#ffdad6]/50 h-8 w-8 p-0 rounded-lg"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="bg-white border-[#c0c7d6]/20">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-[#0b1c30]">确认删除项目？</AlertDialogTitle>
              <AlertDialogDescription className="text-[#707785]">
                此操作将删除营销项目 &quot;{project.title}&quot;。该操作不可撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="border-[#c0c7d6]/50 text-[#0b1c30]">取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete();
                }}
                disabled={isDeleting}
                className="bg-[#ba1a1a] hover:bg-[#93000a]"
              >
                {isDeleting ? "删除中..." : "确认删除"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export const columns: ColumnDef<L4MarketingProject>[] = [
  {
    accessorKey: "title",
    header: "房源信息",
    cell: ({ row }) => {
      const project = row.original;
      // 从images字段获取第一张图片作为封面
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
