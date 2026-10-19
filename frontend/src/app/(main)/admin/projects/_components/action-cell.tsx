"use client";

import { useCallback, useState } from "react";
import { Row, TableMeta } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
  LineChart,
  Wallet,
  MoreVertical,
  Pencil,
  Trash2,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import Link from "next/link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Project } from "../types";
import { deleteProjectAction } from "../actions/core";
import { ArchiveDialog } from "./archive-dialog";
import { HasPermission } from "@/components/has-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";

// 表格 meta 类型:提供 onEdit 回调用于打开详情 Sheet
export type ProjectTableMeta = TableMeta<Project> & {
  onEdit?: (project: Project) => void;
};

interface ActionCellProps {
  row: Row<Project>;
  onEdit?: (project: Project) => void;
}

export function ActionCell({ row, onEdit }: ActionCellProps) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [archiveMode, setArchiveMode] = useState<"archive" | "unarchive" | null>(null);

  // 归档态单一判据：归档后隐藏删除入口（后端亦 400 兜底），仅保留反归档入口
  const isArchived = row.original.is_archived === true;
  // 仅已售 / 已下架可归档：消费后端派生字段 can_archive（权威源 ARCHIVABLE_STATUSES，前后端同源）
  const canArchive = row.original.can_archive === true;

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const monitorHref = `?monitor_id=${row.original.id}&project_name=${encodeURIComponent(row.original.name)}`;
  const ledgerHref = `/admin/ledger/${row.original.id}`;

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const res = await deleteProjectAction(row.original.id);
      if (res.success) {
        toast.success("删除成功");
        setDeleteOpen(false);
      } else {
        toast.error(res.message || "删除失败");
      }
    } catch {
      toast.error("删除失败");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        <Link href={monitorHref} scroll={false} onClick={handleClick}>
          <Button
            variant="ghost"
            size="sm"
            className="text-graphite hover:text-ink hover:bg-fog h-8 w-8 sm:w-auto sm:px-2 p-0 flex items-center justify-center gap-1 transition-all rounded-full"
          >
            <LineChart className="h-3.5 w-3.5" />
            <span className="hidden lg:inline text-xs font-medium">监控</span>
          </Button>
        </Link>

        <Link href={ledgerHref} onClick={handleClick}>
          <Button
            variant="ghost"
            size="sm"
            className="text-graphite hover:text-ink hover:bg-fog h-8 w-8 sm:w-auto sm:px-2 p-0 flex items-center justify-center gap-1 transition-all rounded-full"
          >
            <Wallet className="h-3.5 w-3.5" />
            <span className="hidden lg:inline text-xs font-medium">账本</span>
          </Button>
        </Link>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-graphite hover:text-ink hover:bg-fog h-8 w-8 p-0 rounded-full"
              onClick={handleClick}
              aria-label="操作菜单"
            >
              <MoreVertical className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={handleClick}>
            <HasPermission code={PERMISSION_CODES.PROJECT_WRITE}>
              <DropdownMenuItem onSelect={() => onEdit?.(row.original)} disabled={!onEdit}>
                <Pencil className="h-3.5 w-3.5 mr-2" />
                编辑
              </DropdownMenuItem>
            </HasPermission>
            <HasPermission code={PERMISSION_CODES.PROJECT_WRITE}>
              {isArchived ? (
                <DropdownMenuItem onSelect={() => setArchiveMode("unarchive")}>
                  <ArchiveRestore className="h-3.5 w-3.5 mr-2" />
                  反归档
                </DropdownMenuItem>
              ) : canArchive ? (
                <DropdownMenuItem onSelect={() => setArchiveMode("archive")}>
                  <Archive className="h-3.5 w-3.5 mr-2" />
                  归档
                </DropdownMenuItem>
              ) : null}
            </HasPermission>
            {/* 归档项目不可删除（需先反归档，后端亦 400） */}
            {!isArchived && (
              <HasPermission code={PERMISSION_CODES.PROJECT_DELETE}>
                <DropdownMenuItem
                  onSelect={() => setDeleteOpen(true)}
                  className="text-error focus:text-error"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  删除
                </DropdownMenuItem>
              </HasPermission>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent onClick={handleClick}>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除？</AlertDialogTitle>
            <AlertDialogDescription>此操作将把项目标记为删除状态。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={isDeleting}
              className="bg-error hover:bg-red-700"
            >
              {isDeleting ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 归档 / 反归档弹窗（成功后在弹窗内 router.refresh 刷新列表） */}
      <ArchiveDialog
        open={archiveMode !== null}
        onOpenChange={(open) => setArchiveMode(open ? archiveMode : null)}
        projectId={row.original.id}
        mode={archiveMode ?? "archive"}
      />
    </>
  );
}
