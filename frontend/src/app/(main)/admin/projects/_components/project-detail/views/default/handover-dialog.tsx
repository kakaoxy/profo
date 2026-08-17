"use client";

import { useState } from "react";
import { useCurrentDate } from "@/hooks/use-current-date";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Clock3, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { updateProjectAction, updateProjectStatusAction } from "../../../../actions/core";
import { Project } from "../../../../types";
// [新增] 引入通用组件
import { StatusTransitionDialog } from "../../status-transition-dialog";

interface HandoverDialogProps {
  project: Project;
  onSuccess: () => void;
  /** 可选受控打开状态（详情页 Hero 主 CTA 接线用；不传则由自带触发按钮驱动） */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function HandoverDialog({ project, onSuccess, open, onOpenChange }: HandoverDialogProps) {
  // 我们只在这里管理"日期"这个表单状态
  const initialDate = useCurrentDate();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  // 派生值：用户未选择时默认今天，SSR 时为 undefined 避免 hydration 不匹配
  const date = selectedDate ?? initialDate ?? undefined;

  const handleConfirm = async () => {
    // 1. 表单校验
    if (!date) {
      toast.error("请选择交房日期");
      throw new Error("Date is required"); // 抛出错误阻断流程
    }

    // 2. 更新交房日期
    const dateRes = await updateProjectAction(project.id, {
      planned_handover_date: format(date, "yyyy-MM-dd"),
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
      // Hero 主 CTA 是页面唯一 Ink 实心胶囊，视图内触发按钮降为次级描边形态（仅样式）
      triggerVariant="outline"
      triggerClassName="w-full gap-2 h-12 text-base"
      hideTrigger={open !== undefined}
      kicker="阶段流转 · Signing → Renovation"
      title="确认交房"
      description="交房确认后项目进入装修阶段，签约要件将锁定为只读。请选择实际交房日期。"
      confirmLabel="确认交房，开始装修"
      onConfirm={handleConfirm}
      open={open}
      onOpenChange={onOpenChange}
    >
      {/* [插槽] 这里放入日期选择器 */}
      <div className="space-y-2">
        <label className="text-sm font-medium leading-none">实际交房日期</label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant={"outline"}
              className={cn(
                "w-full justify-start text-left font-normal",
                !date && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date ? format(date, "yyyy年MM月dd日") : <span>选择日期</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={date} onSelect={setSelectedDate} initialFocus />
          </PopoverContent>
        </Popover>
        {/* V4.2 hint（原型 .hint） */}
        <p className="text-[12.5px] font-[430] text-graphite">默认取计划交房日，可修改</p>
      </div>
      {/* V4.1 提示行（原型 .danger-note 样式） */}
      <div className="mt-1 flex gap-2.5 rounded-[14px] border border-[#f0dcd2] bg-[#fdf4ef] px-[15px] py-[13px] text-[13.5px] font-[430] leading-[1.55] text-rust">
        <Clock3 className="mt-[2px] h-4 w-4 shrink-0" />
        <span>流转后签约阶段内容转为只读归档，如需修改需回退阶段（仅管理员）。</span>
      </div>
    </StatusTransitionDialog>
  );
}
