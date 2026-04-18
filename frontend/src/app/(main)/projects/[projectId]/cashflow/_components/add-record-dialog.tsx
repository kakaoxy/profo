"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { createCashFlowRecordAction } from "../actions";
import {
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
  TransactionType,
} from "../types";

interface AddRecordDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function AddRecordDialog({
  projectId,
  isOpen,
  onClose,
  onSuccess,
}: AddRecordDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 表单状态
  const [type, setType] = useState<TransactionType>("expense");
  const [date, setDate] = useState<Date | undefined>(new Date());
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [notes, setNotes] = useState("");

  // 切换收支类型时，重置分类
  useEffect(() => {
    setCategory("");
  }, [type]);

  // 打开弹窗时重置所有状态
  useEffect(() => {
    if (isOpen) {
      setType("expense");
      setDate(new Date());
      setAmount("");
      setCategory("");
      setNotes("");
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!date || !amount || !category) {
      toast.error("请完善必填信息 (金额、日期、分类)");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createCashFlowRecordAction(projectId, {
        type,
        category,
        amount,
        date: format(date, "yyyy-MM-dd"),
        notes,
      });

      if (res.success) {
        toast.success("记账成功");
        onClose();
        if (onSuccess) onSuccess();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("网络错误");
    } finally {
      setIsSubmitting(false);
    }
  };

  const categoryOptions =
    type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>记一笔</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 py-2">
          {/* 1. 收支切换 Tabs */}
          <Tabs
            value={type}
            onValueChange={(v) => setType(v as TransactionType)}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger
                value="expense"
                className="data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-600"
              >
                支出
              </TabsTrigger>
              <TabsTrigger
                value="income"
                className="data-[state=active]:bg-red-50 data-[state=active]:text-red-600"
              >
                收入
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-2 gap-4">
            {/* 2. 金额输入 */}
            <div className="grid gap-2">
              <Label className="text-xs text-slate-500">金额 (元)</Label>
              <Input
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={cn(
                  "font-mono focus-visible:ring-1 text-lg font-semibold", // 字体加大一点
                  type === "income"
                    ? "text-red-600 focus-visible:ring-red-500 placeholder:text-red-200"
                    : "text-emerald-600 focus-visible:ring-emerald-500 placeholder:text-emerald-200"
                )}
              />
            </div>

            {/* 3. 日期选择 */}
            <div className="grid gap-2">
              <Label className="text-xs text-slate-500">发生日期</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full pl-3 text-left font-normal",
                      !date && "text-muted-foreground"
                    )}
                  >
                    {date ? format(date, "yyyy-MM-dd") : <span>选日期</span>}
                    <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
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

          {/* 4. 分类选择 (Tag 模式) */}
          <div className="grid gap-2">
            <Label className="text-xs text-slate-500">分类</Label>
            <div className="flex flex-wrap gap-2">
              {categoryOptions.map((c) => {
                const isSelected = category === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium border transition-all duration-200 flex items-center gap-1.5",
                      // 未选中样式 (统一灰色)
                      !isSelected &&
                        "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                      // 选中样式 (根据收支类型变色)
                      isSelected &&
                        type === "expense" &&
                        "bg-emerald-600 border-emerald-600 text-white shadow-sm ring-2 ring-emerald-100 ring-offset-1",
                      isSelected &&
                        type === "income" &&
                        "bg-red-600 border-red-600 text-white shadow-sm ring-2 ring-red-100 ring-offset-1"
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. 备注 */}
          <div className="grid gap-2">
            <Label className="text-xs text-slate-500">备注说明</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例如：支付首期款..."
              className="h-20 resize-none"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={cn(
              "w-full text-white shadow-sm transition-all active:scale-[0.98]",
              type === "income"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-emerald-600 hover:bg-emerald-700"
            )}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              "确认记账"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
