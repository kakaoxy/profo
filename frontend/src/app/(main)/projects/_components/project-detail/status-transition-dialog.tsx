"use client";

import { useState, ReactNode } from "react";
import { Loader2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface StatusTransitionDialogProps {
  // 触发按钮配置
  triggerLabel: string;
  triggerIcon?: ReactNode;
  triggerVariant?:
    | "default"
    | "destructive"
    | "outline"
    | "secondary"
    | "ghost"
    | "link";

  // 弹窗内容配置
  title: string;
  description: ReactNode;
  children?: ReactNode; // 用于插入表单（如日期选择器）

  // 动作配置
  confirmLabel?: string;
  onConfirm: () => Promise<void>; // 返回 Promise 以便处理 loading
}

export function StatusTransitionDialog({
  triggerLabel,
  triggerIcon,
  triggerVariant = "default", // 默认为黑底白字风格，也可以传入其他风格
  title,
  description,
  children,
  confirmLabel = "确认并流转",
  onConfirm,
}: StatusTransitionDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      // 等待父组件的异步操作完成
      await onConfirm();
      // 只有成功才关闭弹窗
      setOpen(false);
    } catch (error) {
      console.error("Transition failed:", error);
      // 失败时不关闭弹窗，允许用户重试或修改表单
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={triggerVariant === "default" ? "default" : triggerVariant}
          className={
            triggerVariant === "default"
              ? "w-full bg-slate-900 hover:bg-slate-800 text-white gap-2 shadow-sm h-12 text-base"
              : "w-full gap-2"
          }
        >
          {triggerIcon}
          {triggerLabel}
          <ArrowRight className="h-4 w-4" />
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="pt-2 text-sm text-muted-foreground">
              {description}
            </div>
          </DialogDescription>
        </DialogHeader>

        {/* 插槽：用于渲染额外的表单控件 */}
        {children && <div className="py-4">{children}</div>}

        <DialogFooter className="mt-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isLoading}
          >
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            className="bg-slate-900 text-white"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
