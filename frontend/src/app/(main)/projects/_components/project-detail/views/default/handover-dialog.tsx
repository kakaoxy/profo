"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { updateProjectAction, updateProjectStatusAction } from "../../../../actions/core";
import { Project } from "../../../../types";
// [新增] 引入通用组件
import { StatusTransitionDialog } from "../../status-transition-dialog";

interface HandoverDialogProps {
  project: Project;
  onSuccess: () => void;
}

export function HandoverDialog({ project, onSuccess }: HandoverDialogProps) {
  // 我们只在这里管理"日期"这个表单状态
  const [date, setDate] = useState<Date | undefined>(new Date());

  const handleConfirm = async () => {
    // 1. 表单校验
    if (!date) {
      toast.error("请选择交房日期");
      throw new Error("Date is required"); // 抛出错误阻断流程
    }

    // 2. 更新交房日期
    const dateRes = await updateProjectAction(project.id, {
      planned_handover_date: date.toISOString(),
    });
    if (!dateRes.success) throw new Error(dateRes.message);

    // 3. 更新状态为装修中
    const statusRes = await updateProjectStatusAction(project.id, "renovating");
    if (!statusRes.success) throw new Error(statusRes.message);

    toast.success("交房确认成功，进入装修阶段！");
    onSuccess();
  };

  return (
    <StatusTransitionDialog
      triggerLabel="确认交房，开始装修"
      triggerIcon={<KeyRound className="h-4 w-4" />} // 加了个钥匙图标
      title="确认交房"
      description={
        <span>
          请确认房屋实际交房日期。确认后，项目将正式进入<b>装修阶段</b>。
        </span>
      }
      onConfirm={handleConfirm}
    >
      {/* [插槽] 这里放入日期选择器 */}
      <div className="space-y-2">
        <label className="text-sm font-medium leading-none">交房日期</label>
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
              {date ? format(date, "yyyy年MM月dd日") : <span>选择日期</span>}
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
    </StatusTransitionDialog>
  );
}
