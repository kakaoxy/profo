"use client";

import { logger } from "@/lib/logger";
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
  triggerVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  triggerClassName?: string;
  /** 受控模式下隐藏自带触发按钮（由外部按钮触发打开，如详情页 Hero 主 CTA） */
  hideTrigger?: boolean;

  // 弹窗内容配置
  /** 标题上方 Rust 小字标识（V4.1，如「阶段流转 · Signing → Renovation」） */
  kicker?: string;
  title: string;
  description: ReactNode;
  children?: ReactNode; // 用于插入表单（如日期选择器）

  // 动作配置
  confirmLabel?: string;
  onConfirm: () => Promise<void>; // 返回 Promise 以便处理 loading

  // 可选受控打开状态（不传则组件内部自管理，原有用法不变）
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function StatusTransitionDialog({
  triggerLabel,
  triggerIcon,
  triggerVariant = "default", // 默认为黑底白字风格，也可以传入其他风格
  triggerClassName,
  hideTrigger = false,
  kicker,
  title,
  description,
  children,
  confirmLabel = "确认并流转",
  onConfirm,
  open: controlledOpen,
  onOpenChange,
}: StatusTransitionDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // 受控 / 非受控兼容：外部传 open 时由外部驱动开关
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = (next: boolean) => {
    if (!isControlled) setInternalOpen(next);
    onOpenChange?.(next);
  };

  const handleConfirm = async () => {
    setIsLoading(true);
    try {
      // 等待父组件的异步操作完成
      await onConfirm();
      // 只有成功才关闭弹窗
      setOpen(false);
    } catch (error) {
      logger.error("Transition failed:", error);
      // 失败时不关闭弹窗，允许用户重试或修改表单
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger && (
        <DialogTrigger asChild>
          <Button
            variant={triggerVariant === "default" ? "default" : triggerVariant}
            className={
              triggerClassName ??
              (triggerVariant === "default"
                ? "w-full bg-primary hover:bg-primary text-primary-foreground gap-2 shadow-sm h-12 text-base"
                : "w-full gap-2")
            }
          >
            {triggerIcon}
            {triggerLabel}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </DialogTrigger>
      )}

      {/* V4.1 弹窗规格：460px 陶瓷卡（24px 圆角）· Rust kicker · Ink 实心确认（原型 .dlg） */}
      <DialogContent className="gap-0 rounded-cards sm:max-w-[460px]">
        <DialogHeader>
          {kicker && (
            <div className="text-[13px] font-[500] uppercase tracking-[0.08em] text-rust">
              {kicker}
            </div>
          )}
          <DialogTitle className="text-[26px] font-[500] leading-[1.18] tracking-[-0.23px] text-ink">
            {title}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="pt-2 text-[14px] font-[430] leading-[1.6] text-ash">{description}</div>
          </DialogDescription>
        </DialogHeader>

        {/* 插槽：用于渲染额外的表单控件 */}
        {children && <div className="pt-[18px]">{children}</div>}

        <DialogFooter className="mt-[22px]">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isLoading}
            className="rounded-full border-[#e2e2e5] px-[14px] py-[6.5px] text-[13.5px] font-[450] text-ink hover:border-dove hover:bg-[#fafafa]"
          >
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading}
            className="rounded-full border-ink bg-ink px-[14px] py-[6.5px] text-[13.5px] font-[450] text-pure-white hover:bg-[#26282c]"
          >
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
