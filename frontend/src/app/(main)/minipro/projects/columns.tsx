"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MiniProject } from "./types";

import { useRouter } from "next/navigation";
import { getFileUrl } from "@/lib/config";
import { format } from "date-fns";
import { ChevronRight } from "lucide-react";

// Separate component to use hooks
const ActionCell = ({ project }: { project: MiniProject }) => {
  const router = useRouter();

  return (
    <div className="text-right pr-6">
      <button
        type="button"
        onClick={() => router.push(`/minipro/projects/${project.id}`)}
        className="text-muted-foreground hover:text-primary transition-colors"
      >
        <ChevronRight className="h-5 w-5 ml-auto" />
      </button>
    </div>
  );
};

export const columns: ColumnDef<MiniProject>[] = [
  {
    accessorKey: "title",
    header: "房源/小区",
    cell: ({ row }) => {
      const project = row.original;
      const image = project.cover_image;
      return (
        <div className="flex items-center gap-3">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={getFileUrl(image)}
              alt="封面"
              className="w-10 h-10 rounded-lg object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-[10px] text-muted-foreground">
              无图
            </div>
          )}
          <span className="text-sm font-semibold text-foreground truncate max-w-[200px]">
            {project.title || "未命名项目"}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "layout",
    header: "户型",
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.getValue("layout") || "-"}
      </span>
    ),
  },
  {
    accessorKey: "area",
    header: "面积",
    cell: ({ row }) => {
      const area = row.getValue("area") as number;
      return (
        <span className="text-sm text-muted-foreground">
          {area ? `${area.toLocaleString()} m²` : "-"}
        </span>
      );
    },
  },
  {
    accessorKey: "price",
    header: "总价",
    cell: ({ row }) => {
      const price = row.getValue("price") as number;
      return (
        <span className="text-sm font-medium text-destructive">
          {price ? `¥${price.toLocaleString()}` : "-"}
        </span>
      );
    },
  },
  {
    accessorKey: "is_published",
    header: "状态",
    cell: ({ row }) => {
      const isPublished = row.getValue("is_published") as boolean;
      return (
        <span
          className={`px-2.5 py-1 text-[11px] font-medium rounded-full ${
            isPublished
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {isPublished ? "已发布" : "未发布"}
        </span>
      );
    },
  },
  {
    accessorKey: "updated_at",
    header: "最近修改时间",
    cell: ({ row }) => {
      const date = row.getValue("updated_at") as string;
      return (
        <span className="text-sm text-muted-foreground">
          {date ? format(new Date(date), "yyyy/MM/dd") : "-"}
        </span>
      );
    },
  },
  {
    id: "actions",
    header: () => <div className="text-right pr-6">操作</div>,
    cell: ({ row }) => <ActionCell project={row.original} />,
  },
];
