"use client";

import { useState, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { extractErrorMessage } from "@/lib/action-result";
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

export interface DeleteConfirmButtonProps {
  onDelete: () => Promise<{ success: boolean; message?: string; error?: string }>;
  itemName?: string;
  description?: string;
  /** 可选文案；传入后显示图标 + 文案，默认仅图标 */
  label?: string;
  /** 追加按钮样式，用于页面级操作与行内操作统一视觉语言 */
  className?: string;
}

export function DeleteConfirmButton({
  onDelete,
  itemName,
  description,
  label,
  className,
}: DeleteConfirmButtonProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [open, setOpen] = useState(false);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      const res = await onDelete();
      if (res.success) {
        toast.success("删除成功");
        setOpen(false);
      } else {
        toast.error(res.message || res.error || "删除失败");
      }
    } catch (error) {
      toast.error(extractErrorMessage(error));
    } finally {
      setIsDeleting(false);
    }
  }, [onDelete]);

  const handleStopPropagation = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  const title = itemName ? `确认删除 ${itemName}？` : "确认删除？";

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`text-muted-foreground hover:text-error hover:bg-error-container ${
            label ? "h-8 gap-1.5 rounded-full px-2.5" : "h-8 w-8 rounded-full p-0"
          } ${className ?? ""}`}
          aria-label={label || "删除"}
          onClick={handleStopPropagation}
        >
          <Trash2 className="h-3.5 w-3.5" />
          {label ? <span className="text-xs font-medium">{label}</span> : null}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={handleStopPropagation}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description || "此操作不可撤销。"}</AlertDialogDescription>
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
  );
}
