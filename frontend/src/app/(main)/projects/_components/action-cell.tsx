"use client";

import { useState, useCallback } from "react";
import { Row } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { LineChart, Trash2, Wallet } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
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
import { Project } from "../types";
import { deleteProjectAction } from "../actions/core";

interface ActionCellProps {
  row: Row<Project>;
}

export function ActionCell({ row }: ActionCellProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      const res = await deleteProjectAction(row.original.id);
      if (res.success) {
        toast.success("项目已删除");
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("删除失败");
    } finally {
      setIsDeleting(false);
    }
  }, [row.original.id]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const monitorHref = `?monitor_id=${row.original.id}&project_name=${encodeURIComponent(row.original.name)}`;
  const cashflowHref = `?cashflow_id=${row.original.id}&community_name=${encodeURIComponent(row.original.community_name || "")}&address=${encodeURIComponent(row.original.address || "")}`;

  return (
    <div className="flex items-center gap-1">
      <Link href={monitorHref} scroll={false} onClick={handleClick}>
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 h-8 w-8 sm:w-auto sm:px-2 p-0 flex items-center justify-center gap-1 transition-all rounded-full"
        >
          <LineChart className="h-3.5 w-3.5" />
          <span className="hidden lg:inline text-xs font-medium">监控</span>
        </Button>
      </Link>

      <Link href={cashflowHref} scroll={false} onClick={handleClick}>
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 h-8 w-8 sm:w-auto sm:px-2 p-0 flex items-center justify-center gap-1 transition-all rounded-full"
        >
          <Wallet className="h-3.5 w-3.5" />
          <span className="hidden lg:inline text-xs font-medium">账本</span>
        </Button>
      </Link>

      <div className="hidden sm:block">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="text-slate-400 hover:text-red-600 hover:bg-red-50 h-8 w-8 p-0 rounded-full"
              onClick={handleClick}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent onClick={handleClick}>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除项目？</AlertDialogTitle>
              <AlertDialogDescription>
                此操作将把项目标记为删除状态。
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
                确认删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
