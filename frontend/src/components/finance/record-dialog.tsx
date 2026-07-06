"use client";

import { useState, useEffect, useCallback } from "react";
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
import { ImageUpload } from "@/components/common/image-upload";
import type { ImageItem } from "@/components/common/image-upload";

import { createRecord } from "@/app/(main)/admin/ledger/actions";
import type { components } from "@/lib/api-types";

type TransactionType = "income" | "expense";
type LedgerRecordCreate = components["schemas"]["LedgerRecordCreate"];

// ==========================================
// 资金账本统一分类常量
// 值与后端 CashFlowCategory 枚举的 .value 一致（中文字符串）
// ==========================================

/** 支出分类（14 项） */
export const LEDGER_EXPENSE_CATEGORIES: readonly string[] = [
  "履约保证金",
  "渠道佣金",
  "工程装修费",
  "营销推广费",
  "运营服务费",
  "跟投本金退还",
  "投资人利润分配",
  "购房本金",
  "房屋税费",
  "名额费",
  "持有成本-月供",
  "其他税费",
  "项目备用金",
  "其他支出",
] as const;

/** 收入分类（5 项） */
export const LEDGER_INCOME_CATEGORIES: readonly string[] = [
  "保证金回收",
  "增值服务费",
  "项目跟投款",
  "备用金回收",
  "其他收入",
] as const;

interface RecordDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export function RecordDialog({
  projectId,
  isOpen,
  onClose,
  onSuccess,
}: RecordDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 表单状态
  const [type, setType] = useState<TransactionType>("expense");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [receiptUrls, setReceiptUrls] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  // 用于强制重置 ImageUpload 内部状态（每次打开弹窗递增）
  const [uploadKey, setUploadKey] = useState(0);

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
      setCounterparty("");
      setReceiptUrls([]);
      setNotes("");
      setUploadKey((k) => k + 1);
    }
  }, [isOpen]);

  const handleReceiptChange = useCallback((items: ImageItem[]) => {
    const urls = items
      .filter((i) => i.status === "success" && i.url)
      .map((i) => i.url as string);
    setReceiptUrls(urls);
  }, []);

  const handleSubmit = async () => {
    if (!date || !amount || !category || !counterparty.trim()) {
      toast.error("请完善必填信息 (金额、日期、分类、交易方)");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: LedgerRecordCreate = {
        project_id: projectId,
        type,
        category: category as LedgerRecordCreate["category"],
        amount: Number(amount),
        date: format(date, "yyyy-MM-dd"),
        counterparty: counterparty.trim(),
        receipt_urls: receiptUrls.length > 0 ? receiptUrls : null,
        description: notes.trim() || null,
      };

      const res = await createRecord(payload);

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
    type === "income" ? LEDGER_INCOME_CATEGORIES : LEDGER_EXPENSE_CATEGORIES;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>记一笔</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 py-2 max-h-[70vh] overflow-y-auto overscroll-contain pr-1">
          {/* 1. 收支切换 Tabs */}
          <Tabs
            value={type}
            onValueChange={(v) => setType(v as TransactionType)}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger
                value="expense"
                className="data-[state=active]:bg-success-container data-[state=active]:text-success"
              >
                支出
              </TabsTrigger>
              <TabsTrigger
                value="income"
                className="data-[state=active]:bg-error-container data-[state=active]:text-error"
              >
                收入
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid grid-cols-2 gap-4">
            {/* 2. 金额输入 */}
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">金额 (元)</Label>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                name="amount"
                autoComplete="off"
                className={cn(
                  "font-mono focus-visible:ring-1 text-lg font-semibold tabular-nums",
                  type === "income"
                    ? "text-error focus-visible:ring-error placeholder:text-error/30"
                    : "text-success focus-visible:ring-success placeholder:text-success/30",
                )}
              />
            </div>

            {/* 3. 日期选择 */}
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">发生日期</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full pl-3 text-left font-normal",
                      !date && "text-muted-foreground",
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
            <Label className="text-xs text-muted-foreground">分类</Label>
            <div className="flex flex-wrap gap-2">
              {categoryOptions.map((c) => {
                const isSelected = category === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={cn(
                      "px-3 py-1.5 rounded-md text-xs font-medium border transition-[background-color,border-color,box-shadow] duration-200 flex items-center gap-1.5",
                      !isSelected &&
                        "bg-card border-border text-muted-foreground hover:border-border hover:bg-muted",
                      isSelected &&
                        type === "expense" &&
                        "bg-success border-emerald-600 text-white shadow-sm ring-2 ring-emerald-100 ring-offset-1",
                      isSelected &&
                        type === "income" &&
                        "bg-error border-red-600 text-white shadow-sm ring-2 ring-red-100 ring-offset-1",
                    )}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. 交易方（必填） */}
          <div className="grid gap-2">
            <Label className="text-xs text-muted-foreground">
              交易方 <span className="text-destructive">*</span>
            </Label>
            <Input
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              placeholder="例如：张三/某某公司…"
              name="counterparty"
              autoComplete="off"
              required
            />
          </div>

          {/* 6. 票据上传（支持多张） */}
          <div className="grid gap-2">
            <Label className="text-xs text-muted-foreground">
              票据（最多 9 张）
            </Label>
            <ImageUpload
              key={uploadKey}
              maxCount={9}
              gridCols={3}
              aspectRatio="aspect-video"
              title="点击或拖拽图片上传票据"
              onChange={handleReceiptChange}
            />
          </div>

          {/* 7. 备注 */}
          <div className="grid gap-2">
            <Label className="text-xs text-muted-foreground">备注说明</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="例如：支付首期款…"
              className="h-20 resize-none"
              name="notes"
              autoComplete="off"
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={cn(
              "w-full text-white shadow-sm transition-[background-color,transform] active:scale-[0.98] rounded-full",
              type === "income"
                ? "bg-error hover:bg-red-700"
                : "bg-success hover:bg-success",
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

export default RecordDialog;
