"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, ExternalLink } from "lucide-react";
import Link from "next/link";
import { L4MarketingProject, MARKETING_PROJECT_STATUS_CONFIG } from "./types";
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

// 状态配置 - 与project模块保持一致的风格
const statusConfig: Record<string, { label: string; className: string }> = {
  "在售": {
    label: "在售",
    className: "bg-emerald-500 text-white hover:bg-emerald-600",
  },
  "已售": {
    label: "已售",
    className: "bg-slate-300 text-slate-700 hover:bg-slate-400",
  },
  "在途": {
    label: "在途",
    className: "bg-blue-500 text-white hover:bg-blue-600",
  },
};

// 发布状态配置
const publishConfig: Record<string, { label: string; className: string }> = {
  true: {
    label: "已发布",
    className: "bg-emerald-100 text-emerald-700 hover:bg-emerald-200",
  },
  false: {
    label: "草稿",
    className: "bg-amber-100 text-amber-700 hover:bg-amber-200",
  },
};

// 价格格式化
const formatPrice = (value: number | undefined | null) => {
  if (value === undefined || value === null) return "-";
  return `¥${value.toLocaleString()}`;
};

// 面积格式化
const formatArea = (value: number | undefined | null) => {
  if (value === undefined || value === null) return "-";
  return `${value.toLocaleString()} m²`;
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
      <Link href={`/minipro/projects/${project.id}`}>
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 h-8 w-8 sm:w-auto sm:px-2 p-0 flex items-center justify-center gap-1 transition-all rounded-full"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          <span className="hidden lg:inline text-xs font-medium">查看</span>
        </Button>
      </Link>

      <Link href={`/minipro/projects/${project.id}/edit`}>
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 h-8 w-8 sm:w-auto sm:px-2 p-0 flex items-center justify-center gap-1 transition-all rounded-full"
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
              className="text-slate-400 hover:text-red-600 hover:bg-red-50 h-8 w-8 p-0 rounded-full"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除项目？</AlertDialogTitle>
              <AlertDialogDescription>
                此操作将永久删除营销项目 "{project.title}"。该操作不可撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  handleDelete();
                }}
                disabled={isDeleting}
                className="bg-red-600 hover:bg-red-700"
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
    header: "项目名称 / ID",
    cell: ({ row }) => {
      const project = row.original;
      const image = project.cover_image;
      const status = project.project_status || "在途";
      const config = statusConfig[status] || {
        label: status,
        className: "bg-slate-100 text-slate-600",
      };

      return (
        <div className="flex items-center gap-3 py-1 min-w-[180px]">
          {image ? (
            <img
              src={getFileUrl(image)}
              alt="封面"
              className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-[10px] text-slate-400 flex-shrink-0">
              无图
            </div>
          )}
          <div className="flex flex-col min-w-0">
            <span className="font-bold text-slate-800 text-[15px] truncate max-w-[200px] md:max-w-xs">
              {project.title || "未命名项目"}
            </span>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px] text-slate-400 font-mono tracking-tight">
                ID: {project.id.slice(0, 8)}
              </span>
              <Badge
                variant="secondary"
                className={`md:hidden text-[10px] px-1.5 py-0 h-5 border-none rounded-lg ${config.className}`}
              >
                {config.label}
              </Badge>
            </div>
          </div>
        </div>
      );
    },
  },

  {
    accessorKey: "address",
    header: () => (
      <div className="hidden xl:block text-slate-500 font-medium">地址</div>
    ),
    cell: ({ row }) => (
      <span className="hidden xl:block text-sm text-slate-600 truncate max-w-[150px]">
        {row.original.address || "-"}
      </span>
    ),
  },
  {
    accessorKey: "layout",
    header: () => (
      <div className="hidden md:block text-slate-500 font-medium">户型</div>
    ),
    cell: ({ row }) => (
      <span className="hidden md:block text-sm text-slate-600">
        {row.original.layout || "-"}
      </span>
    ),
  },
  {
    accessorKey: "area",
    header: () => (
      <div className="hidden md:block text-right pr-4 text-slate-500 font-medium">
        面积
      </div>
    ),
    cell: ({ row }) => (
      <div className="hidden md:block text-right pr-4 text-sm text-slate-600 tabular-nums">
        {formatArea(row.original.area)}
      </div>
    ),
  },
  {
    accessorKey: "price",
    header: () => (
      <div className="hidden sm:block text-right pr-4 text-slate-500 font-medium">
        总价
      </div>
    ),
    cell: ({ row }) => (
      <div className="hidden sm:block text-right pr-4 font-semibold text-slate-700 tabular-nums">
        {formatPrice(row.original.price)}
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
    accessorKey: "is_published",
    header: () => (
      <div className="hidden lg:block text-slate-500 font-medium">发布状态</div>
    ),
    cell: ({ row }) => {
      const isPublished = row.original.is_published;
      const config = publishConfig[String(isPublished)] || publishConfig.false;

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
    header: () => <div className="text-right pr-4">操作</div>,
    cell: ({ row }) => <ActionCell project={row.original} />,
  },
];
