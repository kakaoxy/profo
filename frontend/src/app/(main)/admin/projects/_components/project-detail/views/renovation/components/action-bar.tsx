"use client";

import { Calendar as CalendarIcon, Loader2, Pencil, Trash2, X, Check } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

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
  // 未完成且有权限时显示完整操作栏
  if (!isCompleted && canComplete) {
    return (
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-md mt-4 border bg-status-renovating/10/30 border-orange-100">
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <span className="bg-orange-100 text-status-renovating px-1.5 py-0.5 rounded text-[10px] font-bold">
            提示
          </span>
          标记该阶段完成
        </div>

        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 min-w-[130px] justify-start text-left font-normal bg-card border-border hover:bg-muted"
              >
                <CalendarIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                {selectedDate ? (
                  format(selectedDate, "yyyy/MM/dd")
                ) : (
                  <span>选择验收日期</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={onDateSelect}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          <Button
            size="sm"
            className="h-8 bg-primary hover:bg-primary text-primary-foreground shadow-sm"
            onClick={() => onSubmit(true)}
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
            完成阶段
          </Button>
        </div>
      </div>
    );
  }

  // 已完成阶段：admin 可修改日期 / 清空回退
  if (isCompleted && canEditDate) {
    // 修改日期模式
    if (isEditingDate) {
      return (
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-md mt-2 border bg-card border-border">
          <div className="text-xs text-muted-foreground flex items-center gap-2">
            <span className="bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded text-[10px] font-bold">
              修改
            </span>
            选择新的完成日期
          </div>

          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 min-w-[130px] justify-start text-left font-normal bg-card border-border hover:bg-muted"
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                  {editDate ? format(editDate, "yyyy/MM/dd") : <span>选择日期</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={editDate}
                  onSelect={onEditDateSelect}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Button
              size="sm"
              className="h-8 bg-primary hover:bg-primary text-primary-foreground"
              onClick={onSubmitEditDate}
              disabled={isEditingSubmitting || !editDate}
            >
              {isEditingSubmitting ? (
                <Loader2 className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <Check className="mr-2 h-3 w-3" />
              )}
              确认
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={onCancelEditDate}
              disabled={isEditingSubmitting}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      );
    }

    // 默认态：修改 / 清空 按钮
    return (
      <div className="flex justify-end items-center gap-2 mt-2">
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          onClick={onStartEditDate}
          disabled={isClearing}
        >
          <Pencil className="mr-1 h-3 w-3" />
          修改日期
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
          onClick={onClearDate}
          disabled={isClearing}
        >
          {isClearing ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="mr-1 h-3 w-3" />
          )}
          清空
        </Button>
      </div>
    );
  }

  // 历史阶段无权限修改：保持空
  return <div className="flex justify-end mt-2" />;
}
