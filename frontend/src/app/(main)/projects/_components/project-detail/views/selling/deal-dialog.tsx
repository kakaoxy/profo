"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Gavel } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { Project } from "../../../../types";
import { completeProjectAction } from "../../../../actions/sales";
import { StatusTransitionDialog } from "../../status-transition-dialog";

interface DealDialogProps {
  project: Project;
  onSuccess?: () => void;
}

export function DealDialog({ project, onSuccess }: DealDialogProps) {
  const [date, setDate] = useState<Date | undefined>(undefined);
  useEffect(() => { setDate(new Date()); }, []);
  const [price, setPrice] = useState("");

  const handleConfirm = async () => {
    if (!date) {
      toast.error("请选择成交日期");
      throw new Error("请选择成交日期");
    }
    if (!price || Number(price) <= 0) {
      toast.error("请输入有效的成交价格");
      throw new Error("请输入有效的成交价格");
    }

    const res = await completeProjectAction(project.id, {
      soldPrice: Number(price),
      soldDate: format(date, "yyyy-MM-dd"),
    });

    if (res.success) {
      toast.success("恭喜！项目已成功结案");
      if (onSuccess) onSuccess();
      return;
    }

    toast.error(res.message || "操作失败");
    throw new Error(res.message || "操作失败");
  };

  return (
    <StatusTransitionDialog
      triggerLabel="确认成交"
      triggerIcon={
        <Gavel className="mr-2 h-4 w-4" />
      }
      triggerClassName="w-full bg-success hover:bg-success text-white shadow-sm transition-all duration-200 active:scale-[0.98]"
      title="确认成交信息"
      description="请填写最终的成交价格和日期，系统将自动计算利润并归档项目。"
      confirmLabel="确认结案"
      onConfirm={handleConfirm}
    >
      <div className="grid gap-5 py-0">
        <div className="grid gap-2">
          <Label
            htmlFor="deal-date"
            className="text-xs font-medium text-muted-foreground"
          >
            成交日期
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                id="deal-date"
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal border-border hover:bg-muted",
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

        <div className="grid gap-2">
          <Label
            htmlFor="deal-price"
            className="text-xs font-medium text-muted-foreground"
          >
            成交总价 (万元)
          </Label>
          <div className="relative">
            <Input
              id="deal-price"
              type="number"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="pl-3 pr-8 border-border focus-visible:ring-status-selling"
            />
            <span className="absolute right-3 top-2.5 text-xs text-muted-foreground">
              万
            </span>
          </div>
        </div>
      </div>
    </StatusTransitionDialog>
  );
}
