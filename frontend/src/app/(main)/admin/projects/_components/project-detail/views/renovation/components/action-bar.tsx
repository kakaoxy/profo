"use client";

import { ArrowRight, Calendar as CalendarIcon, Check, Loader2, Pencil, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface ActionBarProps {
  isCompleted: boolean;
  selectedDate: Date | undefined;
  isLoading: boolean;
  canComplete: boolean;
  onDateSelect: (date: Date | undefined) => void;
  onSubmit: (isComplete: boolean) => void;
  // 已完成阶段修改/清空（仅 admin）
  canEditDate: boolean;
  isEditingDate: boolean;
  editDate: Date | undefined;
  isEditingSubmitting: boolean;
  isClearing: boolean;
  onEditDateSelect: (date: Date | undefined) => void;
  onStartEditDate: () => void;
  onCancelEditDate: () => void;
  onSubmitEditDate: () => void;
  onClearDate: () => void;
}

/** 设计稿 .btn-sm：胶囊描边小按钮（13.5px/450/圆角全圆） */
const btnSm =
  "inline-flex items-center gap-1.5 rounded-full border border-[#e2e2e5] bg-pure-white px-[14px] py-[6.5px] text-[13.5px] font-[450] text-ink transition-all hover:border-dove hover:bg-[#fafafa] disabled:opacity-60";

/** 设计稿 .btn-sm.danger：Rust 描边危险按钮 */
const btnSmDanger =
  "inline-flex items-center gap-1.5 rounded-full border border-[#e8d5ca] bg-pure-white px-[14px] py-[6.5px] text-[13.5px] font-[450] text-rust transition-all hover:border-rust hover:bg-[#fdf4ef] disabled:opacity-60";

/** 设计稿 .btn-sm.solid：Ink 实心胶囊 */
const btnSmSolid =
  "inline-flex items-center gap-1.5 rounded-full border border-ink bg-ink px-[14px] py-[6.5px] text-[13.5px] font-[450] text-pure-white transition-all hover:bg-[#26282c] disabled:opacity-60";

export function ActionBar({
  isCompleted,
  selectedDate,
  isLoading,
  canComplete,
  onDateSelect,
  onSubmit,
  canEditDate,
  isEditingDate,
  editDate,
  isEditingSubmitting,
  isClearing,
  onEditDateSelect,
  onStartEditDate,
  onCancelEditDate,
  onSubmitEditDate,
  onClearDate,
}: ActionBarProps) {
  // 未完成且有权限：验收日期选择（btn-sm）+「标记该阶段完成 →」textlink（设计稿 .tl-actions）
  if (!isCompleted && canComplete) {
    return (
      <div className="flex flex-wrap items-center gap-2.5">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(btnSm, "h-[34px] min-w-[150px] justify-start shadow-none")}
            >
              <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-graphite" />
              {selectedDate ? (
                format(selectedDate, "yyyy.MM.dd")
              ) : (
                <span className="text-graphite">选择验收日期</span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={selectedDate} onSelect={onDateSelect} initialFocus />
          </PopoverContent>
        </Popover>

        <button
          type="button"
          onClick={() => onSubmit(true)}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 bg-none text-[14px] font-[450] text-ink transition-colors hover:underline hover:underline-offset-4 disabled:opacity-60"
        >
          {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          标记该阶段完成
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // 已完成阶段：admin 可修改日期 / 清空回退
  if (isCompleted && canEditDate) {
    // 修改日期模式
    if (isEditingDate) {
      return (
        <div className="flex flex-wrap items-center gap-2.5">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn(btnSm, "h-[34px] min-w-[150px] justify-start shadow-none")}
              >
                <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-graphite" />
                {editDate ? (
                  format(editDate, "yyyy.MM.dd")
                ) : (
                  <span className="text-graphite">选择日期</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={editDate}
                onSelect={onEditDateSelect}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <button
            type="button"
            onClick={onSubmitEditDate}
            disabled={isEditingSubmitting || !editDate}
            className={btnSmSolid}
          >
            {isEditingSubmitting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Check className="h-3.5 w-3.5" />
            )}
            确认
          </button>
          <button
            type="button"
            onClick={onCancelEditDate}
            disabled={isEditingSubmitting}
            className={btnSm}
          >
            取消
          </button>
        </div>
      );
    }

    // 默认态：修改完成日期 / 清空日期（设计稿 .btn-sm + .btn-sm.danger）
    return (
      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" onClick={onStartEditDate} disabled={isClearing} className={btnSm}>
          <Pencil className="h-3.5 w-3.5" />
          修改完成日期
        </button>
        <button type="button" onClick={onClearDate} disabled={isClearing} className={btnSmDanger}>
          {isClearing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Trash2 className="h-3.5 w-3.5" />
          )}
          清空日期
        </button>
      </div>
    );
  }

  // 历史阶段无权限修改：不渲染
  return null;
}
