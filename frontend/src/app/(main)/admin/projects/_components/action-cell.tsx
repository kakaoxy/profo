"use client";

import { useCallback, useState } from "react";
import { Row, TableMeta } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { LineChart, Wallet, MoreVertical, Pencil, Trash2 } from "lucide-react";
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
            className="text-muted-foreground hover:text-primary hover:bg-primary/10 h-8 w-8 sm:w-auto sm:px-2 p-0 flex items-center justify-center gap-1 transition-all rounded-full"
          >
            <LineChart className="h-3.5 w-3.5" />
            <span className="hidden lg:inline text-xs font-medium">监控</span>
          </Button>
        </Link>

        <Link href={ledgerHref} onClick={handleClick}>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-success hover:bg-success-container h-8 w-8 sm:w-auto sm:px-2 p-0 flex items-center justify-center gap-1 transition-all rounded-full"
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
              className="text-muted-foreground hover:text-foreground hover:bg-muted h-8 w-8 p-0 rounded-full"
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
            <HasPermission code={PERMISSION_CODES.PROJECT_DELETE}>
              <DropdownMenuItem
                onSelect={() => setDeleteOpen(true)}
                className="text-error focus:text-error"
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                删除
              </DropdownMenuItem>
            </HasPermission>
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
    </>
  );
}
