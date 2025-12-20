"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Gavel, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

import { Project } from "../../../../types";
import { completeProjectAction } from "../../../../actions";

interface DealDialogProps {
  project: Project;
  onSuccess?: () => void;
}

export function DealDialog({ project, onSuccess }: DealDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 表单状态
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [price, setPrice] = useState("");

  const handleConfirm = async () => {
    // 1. 校验
    if (!date) {
      toast.error("请选择成交日期");
      return;
    }
    if (!price || Number(price) <= 0) {
      toast.error("请输入有效的成交价格");
      return;
    }

    setIsSubmitting(true);
    try {
      // 2. 调用 Server Action
      const res = await completeProjectAction(project.id, {
        soldPrice: Number(price),
        soldDate: date.toISOString(),
      });

      if (res.success) {
        toast.success("恭喜！项目已成功结案");
        setIsOpen(false);
        if (onSuccess) onSuccess();
      } else {
        toast.error(res.message || "操作失败");
      }
    } catch (error) {
      console.error(error);
      toast.error("网络请求失败");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition-all duration-200 active:scale-[0.98]">
          <Gavel className="mr-2 h-4 w-4" />
          确认成交
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-700">
            <Gavel className="h-5 w-5" />
            确认成交信息
          </DialogTitle>
          <DialogDescription>
            请填写最终的成交价格和日期，系统将自动计算利润并归档项目。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 py-4">
          {/* 1. 成交日期 */}
          <div className="grid gap-2">
            <Label
              htmlFor="date"
              className="text-xs font-medium text-slate-500"
            >
              成交日期
            </Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="date"
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal border-slate-200 hover:bg-slate-50",
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

          {/* 2. 成交总价 */}
          <div className="grid gap-2">
            <Label
              htmlFor="price"
              className="text-xs font-medium text-slate-500"
            >
              成交总价 (万元)
            </Label>
            <div className="relative">
              <Input
                id="price"
                type="number"
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="pl-3 pr-8 border-slate-200 focus-visible:ring-emerald-500"
              />
              <span className="absolute right-3 top-2.5 text-xs text-slate-400">
                万
              </span>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isSubmitting}
            className="border-slate-200 text-slate-600"
          >
            取消
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="bg-emerald-600 hover:bg-emerald-700 text-white min-w-[80px]"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "确认结案"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
