"use client";

import { Button } from "@/components/ui/button";
import { Pencil, Trash2, Eye } from "lucide-react";
import Link from "next/link";
import { L4MarketingProject } from "../types";
import { deleteL4MarketingProjectAction } from "../actions";
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

interface ActionCellProps {
  project: L4MarketingProject;
}

export function ActionCell({ project }: ActionCellProps) {
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
      <Link href={`/l4-marketing/projects/${project.id}/preview`}>
        <Button
          variant="ghost"
          size="sm"
          className="text-[#707785] hover:text-[#005daa] hover:bg-[#a5c8ff]/20 h-8 w-8 sm:w-auto sm:px-2 p-0 flex items-center justify-center gap-1 transition-all rounded-lg"
        >
          <Eye className="h-3.5 w-3.5" />
          <span className="hidden lg:inline text-xs font-medium">预览</span>
        </Button>
      </Link>

      <Link href={`/l4-marketing/projects/${project.id}/edit`}>
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
}
