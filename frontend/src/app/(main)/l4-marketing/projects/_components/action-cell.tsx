"use client";

import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Eye } from "lucide-react";
import Link from "next/link";
import { L4MarketingProject } from "@/app/(main)/l4-marketing/projects/types";
import { deleteL4MarketingProjectAction } from "../actions";
import { toast } from "sonner";
import { memo, useCallback, useState } from "react";
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

interface ActionCellProps {
  project: L4MarketingProject;
}

export const ActionCell = memo(function ActionCell({ project }: ActionCellProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
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
  }, [project.id]);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div className="flex items-center gap-1">
      <Link
        href={`/l4-marketing/projects/${project.id}/preview`}
        onClick={handleClick}
      >
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 h-8 w-8 sm:w-auto sm:px-2 p-0 flex items-center justify-center gap-1 transition-all rounded-full"
          onClick={handleClick}
        >
          <Eye className="h-3.5 w-3.5" />
          <span className="hidden lg:inline text-xs font-medium">预览</span>
        </Button>
      </Link>

      <Link
        href={`/l4-marketing/projects/${project.id}/edit`}
        onClick={handleClick}
      >
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 h-8 w-8 sm:w-auto sm:px-2 p-0 flex items-center justify-center gap-1 transition-all rounded-full"
          onClick={handleClick}
        >
          <Pencil className="h-3.5 w-3.5" />
          <span className="hidden lg:inline text-xs font-medium">编辑</span>
        </Button>
      </Link>

      <div className="hidden sm:block" onClick={handleClick}>
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
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除项目？</AlertDialogTitle>
              <AlertDialogDescription>
                此操作将删除营销项目 &quot;{project.title}&quot;。该操作不可撤销。
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
                className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
              >
                {isDeleting ? "删除中..." : "确认删除"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
});
