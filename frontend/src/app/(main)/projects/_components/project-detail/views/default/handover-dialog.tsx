"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Loader2, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  updateProjectAction,
  updateProjectStatusAction,
} from "../../../../actions";
import { Project } from "../../../../types";

interface HandoverDialogProps {
  project: Project;
  onSuccess: () => void;
}

export function HandoverDialog({ project, onSuccess }: HandoverDialogProps) {
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [isLoading, setIsLoading] = useState(false);

  const handleConfirm = async () => {
    if (!date) {
      toast.error("请选择交房日期");
      return;
    }

    setIsLoading(true);
    try {
      // 1. 更新交房日期
      const dateRes = await updateProjectAction(project.id, {
        planned_handover_date: date.toISOString(),
      });

      if (!dateRes.success) throw new Error(dateRes.message);

      // 2. 更新状态为 "renovating" (装修中)
      // 注意：这里传给后端的是 Enum 值，通常是 "renovating" 或 "renovation"
      const statusRes = await updateProjectStatusAction(
        project.id,
        "renovating"
      );

      if (!statusRes.success) throw new Error(statusRes.message);

      toast.success("交房确认成功，进入装修阶段！");
      setOpen(false);
      onSuccess(); // 触发视图切换
    } catch (error: unknown) {
      // [修复] 使用 unknown 替代 any，并进行类型收窄
      const errorMessage = error instanceof Error ? error.message : "操作失败";
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="w-full bg-slate-900 hover:bg-slate-800 text-white gap-2 shadow-sm h-12 text-base">
          确认交房，开始装修
          <ArrowRight className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>确认交房</DialogTitle>
          <DialogDescription>
            请确认房屋实际交房日期。确认后，项目将正式进入<b>装修阶段</b>。
          </DialogDescription>
        </DialogHeader>

        <div className="py-6">
          <div className="space-y-2">
            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              交房日期
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !date && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? (
                    format(date, "yyyy年MM月dd日")
                  ) : (
                    <span>选择日期</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter>
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
            确认并流转
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
