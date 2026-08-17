"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { updateRenovationContractAction } from "../../../../actions/renovation";

interface ActualEndDateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  currentActualEndDate?: string | null;
  onSuccess?: () => void;
  /** 弹窗语义：edit=编辑实际竣工时间（默认）；end=flowbar「结束项目」（仅标题/文案变化，提交逻辑一致） */
  mode?: "edit" | "end";
}

export function ActualEndDateDialog({
  open,
  onOpenChange,
  projectId,
  currentActualEndDate,
  onSuccess,
  mode = "edit",
}: ActualEndDateDialogProps) {
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const isEndMode = mode === "end";

  // 每次打开时用当前值预填
  useEffect(() => {
    if (open) {
      setSelectedDate(currentActualEndDate ? new Date(currentActualEndDate) : undefined);
    }
  }, [open, currentActualEndDate]);

  const handleConfirm = async () => {
    if (!selectedDate) {
      toast.error("请选择实际竣工日期");
      return;
    }

    try {
      setIsSaving(true);
      const res = await updateRenovationContractAction(projectId, {
        actual_end_date: format(selectedDate, "yyyy-MM-dd"),
      });

      if (res.success) {
        toast.success("实际竣工时间已更新");
        onOpenChange(false);
        onSuccess?.();
      } else {
        toast.error(res.message || "更新失败");
      }
    } catch {
      toast.error("更新时发生错误");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEndMode ? "结束项目" : "编辑实际竣工时间"}</DialogTitle>
          <DialogDescription>
            {isEndMode
              ? "填写实际结束日期后项目将结束销售，不可恢复为在售状态。"
              : "修改装修实际竣工时间，保存后立即生效。"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2 py-2">
          <Label className="text-xs font-medium text-muted-foreground">实际竣工日期</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !selectedDate && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDate ? format(selectedDate, "yyyy年MM月dd日") : <span>选择日期</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={setSelectedDate}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            取消
          </Button>
          <Button onClick={handleConfirm} disabled={isSaving || !selectedDate}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {isEndMode ? "确认结束项目" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
