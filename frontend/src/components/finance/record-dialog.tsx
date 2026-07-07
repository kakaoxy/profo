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
type BusinessType = "general" | "agent" | "wholesale";
type StageGroup = { stage: string; items: string[] };
type LedgerRecordCreate = components["schemas"]["LedgerRecordCreate"];

// ==========================================
// 资金账本分类数据（三级结构：收支 → 业务类型 → 阶段 → 分类）
// 与 docs/jizhang.html 的 DATA 结构一致
// ==========================================

const LEDGER_CATEGORY_DATA: Record<TransactionType, Record<BusinessType, StageGroup[]>> = {
  expense: {
    general: [
      { stage: "签约", items: ["渠道佣金"] },
      { stage: "装修", items: ["工程装修费"] },
      { stage: "在售", items: ["营销费垫付"] },
      { stage: "已售", items: ["跟投本金退还", "投资人利润分配", "营销推广费", "运营费", "财税成本", "项目激励"] },
      { stage: "其他", items: ["项目备用金", "其他支出"] },
    ],
    agent: [
      { stage: "签约", items: ["履约保证金"] },
      { stage: "已售", items: ["代付佣金", "税费及佣金差额"] },
    ],
    wholesale: [
      { stage: "签约", items: ["购房款-定金", "购房款-首付", "购房款-税费", "名额费", "持有月供"] },
      { stage: "已售", items: ["卖房佣金", "卖房税费"] },
    ],
  },
  income: {
    general: [
      { stage: "在售", items: ["营销推广费抵扣"] },
      { stage: "已售", items: ["项目跟投款"] },
      { stage: "备用金", items: ["备用金回收"] },
      { stage: "其他", items: ["其他费用"] },
    ],
    agent: [
      { stage: "已售", items: ["保证金回收", "增值服务费"] },
      { stage: "在售", items: ["业主佣金"] },
    ],
    wholesale: [
      { stage: "已售", items: ["房价款"] },
    ],
  },
};

/**
 * 前端显示名 → 后端枚举值映射表。
 * 仅列出名称不一致的项；名称一致的无需映射。
 */
const CATEGORY_DISPLAY_TO_ENUM: Record<string, string> = {
  "持有月供": "持有成本-月供",
  "购房款-税费": "房屋税费",
  "其他费用": "其他收入",
  "房价款": "售房款",
};

const BUSINESS_TYPE_OPTIONS: { value: BusinessType; label: string }[] = [
  { value: "general", label: "通用" },
  { value: "agent", label: "代理" },
  { value: "wholesale", label: "收购" },
];

/** 根据 businessForm 推断默认业务类型 */
function getDefaultBusinessType(businessForm?: "agent" | "wholesale" | null): BusinessType {
  if (businessForm === "agent") return "agent";
  if (businessForm === "wholesale") return "wholesale";
  return "general";
}

interface RecordDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  businessForm?: "agent" | "wholesale" | null;
}

export function RecordDialog({
  projectId,
  isOpen,
  onClose,
  onSuccess,
  businessForm,
}: RecordDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 表单状态
  const [type, setType] = useState<TransactionType>("expense");
  const [businessType, setBusinessType] = useState<BusinessType>("general");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [receiptUrls, setReceiptUrls] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  // 用于强制重置 ImageUpload 内部状态（每次打开弹窗递增）
  const [uploadKey, setUploadKey] = useState(0);

  // 打开弹窗时重置所有状态
  useEffect(() => {
    if (isOpen) {
      setType("expense");
      setBusinessType(getDefaultBusinessType(businessForm));
      setDate(new Date());
      setAmount("");
      setCategory("");
      setCounterparty("");
      setReceiptUrls([]);
      setNotes("");
      setUploadKey((k) => k + 1);
    }
  }, [isOpen, businessForm]);

  // 切换收支类型时，重置分类选择
  useEffect(() => {
    setCategory("");
  }, [type]);

  // businessForm 变化时更新默认业务类型（弹窗关闭时也要同步）
  useEffect(() => {
    setBusinessType(getDefaultBusinessType(businessForm));
  }, [businessForm]);

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
      // 提交时将前端显示名映射为后端枚举值
      const enumCategory = CATEGORY_DISPLAY_TO_ENUM[category] ?? category;
      const payload: LedgerRecordCreate = {
        project_id: projectId,
        type,
        category: enumCategory as LedgerRecordCreate["category"],
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

  const stageGroups = LEDGER_CATEGORY_DATA[type][businessType] ?? [];

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

          {/* 2. 交易方（必填，移至顶部） */}
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

          {/* 3. 金额 + 发生日期 */}
          <div className="grid grid-cols-2 gap-4">
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

          {/* 4. 业务类型（通用/代理/收购，胶囊按钮组） */}
          <div className="grid gap-2">
            <Label className="text-xs text-muted-foreground">业务类型</Label>
            <div className="flex gap-2">
              {BUSINESS_TYPE_OPTIONS.map((opt) => {
                const isSelected = businessType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setBusinessType(opt.value);
                      setCategory("");
                    }}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-full text-xs font-medium border transition-[background-color,border-color,box-shadow] duration-200",
                      !isSelected &&
                        "bg-card border-border text-muted-foreground hover:border-border hover:bg-muted",
                      isSelected &&
                        type === "expense" &&
                        "bg-success border-emerald-600 text-white shadow-sm",
                      isSelected &&
                        type === "income" &&
                        "bg-error border-red-600 text-white shadow-sm",
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. 分类（按阶段分组渲染） */}
          <div className="grid gap-2">
            <Label className="text-xs text-muted-foreground">
              分类 <span className="text-destructive">*</span>
            </Label>
            <div className="grid gap-3">
              {stageGroups.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">该业务类型下暂无分类配置</p>
              ) : (
                stageGroups.map((group) => (
                  <div key={group.stage} className="grid gap-1.5">
                    <span className="text-[11px] text-muted-foreground/70 font-medium">
                      {group.stage}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {group.items.map((c) => {
                        const isSelected = category === c;
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setCategory(c)}
                            className={cn(
                              "px-2.5 py-1 rounded-md text-xs font-medium border transition-[background-color,border-color,box-shadow] duration-200 flex items-center gap-1",
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
                ))
              )}
            </div>
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
