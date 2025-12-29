"use client";

import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ActionBarProps {
  isCurrent: boolean;
  selectedDate: Date | undefined;
  isLoading: boolean;
  onDateSelect: (date: Date | undefined) => void;
  onSubmit: (isComplete: boolean) => void;
}

export function ActionBar({
  isCurrent,
  selectedDate,
  isLoading,
  onDateSelect,
  onSubmit,
}: ActionBarProps) {
  // 当前阶段显示完整操作栏
  if (isCurrent) {
    return (
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 rounded-md mt-4 border bg-orange-50/30 border-orange-100">
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <span className="bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded text-[10px] font-bold">
            提示
          </span>
          完成后将自动进入下一阶段
        </div>

        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 min-w-[130px] justify-start text-left font-normal bg-white border-slate-200 hover:bg-slate-50"
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
            className="h-8 bg-slate-900 hover:bg-slate-800 text-white shadow-sm"
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

  // 历史阶段仅显示简单的更新按钮（如果需要的话，目前需求是只读或补传）
  return (
    <div className="flex justify-end mt-2">
      {/* 预留位置，如果未来支持修改历史日期，可放这里 */}
    </div>
  );
}
