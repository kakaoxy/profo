"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
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
import { ReceivablePayableTable } from "@/components/finance/receivable-payable-table";
import { SubjectSelectPanel } from "@/app/(main)/admin/ledger/_components/subject-select-panel";

import { createRecord } from "@/app/(main)/admin/ledger/actions";
import { createRecordSchema } from "@/app/(main)/admin/ledger/_components/ledger-schema";

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
  const [showReceivablePayable, setShowReceivablePayable] = useState(false);

  // 表单状态（Task 8 重构：subject_id + outflow/inflow + payer/payee）
  const [subjectId, setSubjectId] = useState("");
  const [date, setDate] = useState<Date | undefined>(undefined);
  const [outflow, setOutflow] = useState("");
  const [inflow, setInflow] = useState("");
  const [payer, setPayer] = useState("");
  const [payee, setPayee] = useState("");
  const [receiptUrls, setReceiptUrls] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 用于强制重置 ImageUpload 内部状态（每次打开弹窗递增）
  const [uploadKey, setUploadKey] = useState(0);

  // 打开弹窗时重置所有状态
  useEffect(() => {
    if (isOpen) {
      setSubjectId("");
      setDate(new Date());
      setOutflow("");
      setInflow("");
      setPayer("");
      setPayee("");
      setReceiptUrls([]);
      setNotes("");
      setErrors({});
      setUploadKey((k) => k + 1);
      setShowReceivablePayable(false);
    }
  }, [isOpen]);

  const handleReceiptChange = useCallback((items: ImageItem[]) => {
    const urls = items
      .filter((i) => i.status === "success" && i.url)
      .map((i) => i.url as string);
    setReceiptUrls(urls);
  }, []);

  // type 从 outflow/inflow 推导（供 ReceivablePayableTable 联动使用）
  // outflow > 0 → expense, inflow > 0 → income, 默认 expense
  const derivedType: "expense" | "income" = useMemo(() => {
    const out = Number(outflow) || 0;
    const infl = Number(inflow) || 0;
    if (infl > 0 && out <= 0) return "income";
    return "expense";
  }, [outflow, inflow]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!date) e.date = "请选择日期";
    if (!subjectId) e.subjectId = "请选择科目分类";

    const out = Number(outflow) || 0;
    const infl = Number(inflow) || 0;
    if (out <= 0 && infl <= 0) {
      e.amount = "流出/流入至少填一项且大于0";
    }
    // outflow/inflow 互斥校验复用 createRecordSchema.refine（见 ledger-schema.ts），避免重复
    const parsed = createRecordSchema.safeParse({
      project_id: projectId,
      subject_id: subjectId,
      date: date ? format(date, "yyyy-MM-dd") : "",
      outflow: out,
      inflow: infl,
      payer: payer.trim() || null,
      payee: payee.trim() || null,
      description: notes.trim() || null,
      receipt_urls: receiptUrls.length > 0 ? receiptUrls : null,
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        if (issue.path[0] === "outflow" && !e.amount) {
          e.amount = issue.message;
        }
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const handleSubmit = async () => {
    if (!validate()) {
      toast.error("请完善必填信息");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        project_id: projectId,
        subject_id: subjectId,
        outflow: Number(outflow) || 0,
        inflow: Number(inflow) || 0,
        payer: payer.trim() || null,
        payee: payee.trim() || null,
        date: format(date!, "yyyy-MM-dd"),
        description: notes.trim() || null,
        receipt_urls: receiptUrls.length > 0 ? receiptUrls : null,
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

  // 表单内容（单栏/双栏布局复用，避免字段 JSX 重复）
  const formContent = (
    <div className="grid gap-5 py-2 max-h-[70vh] overflow-y-auto overscroll-contain pr-1">
      {/* 1. 科目分类（必填，下拉面板，按业务模式自动过滤） */}
      <div className="grid gap-2">
        <Label className="text-xs text-muted-foreground">
          科目分类 <span className="text-destructive">*</span>
          <span className="ml-1 text-dove font-normal">
            · 已按业务模式自动过滤
          </span>
        </Label>
        <SubjectSelectPanel
          value={subjectId}
          onChange={setSubjectId}
          businessForm={businessForm}
          error={errors.subjectId}
        />
      </div>

      {/* 2. 流出/流入双字段（互斥：一个 > 0 时另一个必须 = 0） */}
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label className="text-xs text-muted-foreground">流出金额 (元)</Label>
          <div className="flex items-stretch rounded-lg border border-border overflow-hidden bg-card focus-within:border-ink focus-within:ring-1 focus-within:ring-ink/20 transition-[border-color,box-shadow]">
            <span className="flex items-center px-3 bg-fog text-graphite text-sm font-semibold border-r border-border">
              ¥
            </span>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={outflow}
              onChange={(e) => setOutflow(e.target.value)}
              autoComplete="off"
              className="border-0 rounded-none focus-visible:ring-0 font-mono tabular-nums text-error"
            />
          </div>
        </div>
        <div className="grid gap-2">
          <Label className="text-xs text-muted-foreground">流入金额 (元)</Label>
          <div className="flex items-stretch rounded-lg border border-border overflow-hidden bg-card focus-within:border-ink focus-within:ring-1 focus-within:ring-ink/20 transition-[border-color,box-shadow]">
            <span className="flex items-center px-3 bg-fog text-graphite text-sm font-semibold border-r border-border">
              ¥
            </span>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={inflow}
              onChange={(e) => setInflow(e.target.value)}
              autoComplete="off"
              className="border-0 rounded-none focus-visible:ring-0 font-mono tabular-nums text-success"
            />
          </div>
        </div>
      </div>
      {errors.amount && (
        <span className="text-[11px] text-destructive -mt-3">{errors.amount}</span>
      )}

      {/* 3. 付款方 / 收款方 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="grid gap-2">
          <Label className="text-xs text-muted-foreground">付款方</Label>
          <Input
            value={payer}
            onChange={(e) => setPayer(e.target.value)}
            placeholder="股东A / 公司 / 银行"
            autoComplete="off"
          />
        </div>
        <div className="grid gap-2">
          <Label className="text-xs text-muted-foreground">收款方</Label>
          <Input
            value={payee}
            onChange={(e) => setPayee(e.target.value)}
            placeholder="房东 / 银行 / 装修队"
            autoComplete="off"
          />
        </div>
      </div>

      {/* 4. 发生日期 */}
      <div className="grid gap-2">
        <Label className="text-xs text-muted-foreground">
          发生日期 <span className="text-destructive">*</span>
        </Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full pl-3 text-left font-normal",
                !date && "text-muted-foreground",
                errors.date && "border-destructive",
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
        {errors.date && <span className="text-[11px] text-destructive">{errors.date}</span>}
      </div>

      {/* 5. 票据上传（支持多张，最多 9 张） */}
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

      {/* 6. 备注 */}
      <div className="grid gap-2">
        <Label className="text-xs text-muted-foreground">备注说明</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="例如：支付首期款…"
          className="h-20 resize-none"
          autoComplete="off"
        />
      </div>
    </div>
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        className={cn(
          "sm:max-w-[450px] rounded-[20px]",
          showReceivablePayable && "sm:max-w-[1000px]",
        )}
      >
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-[17px] font-medium tracking-[-0.009em] text-ink">
              记一笔
            </DialogTitle>
            <Button
              variant="ghost"
              size="sm"
              type="button"
              onClick={() => setShowReceivablePayable((v) => !v)}
              className={cn(
                "rounded-full text-[13px] font-medium tracking-[-0.009em] text-ink",
                showReceivablePayable ? "bg-fog" : "hover:bg-fog",
              )}
            >
              应收应付
            </Button>
          </div>
        </DialogHeader>

        {showReceivablePayable ? (
          <div className="flex gap-6">
            <div className="w-[480px] shrink-0 border-r border-dove/30 pr-6 overflow-hidden">
              <ReceivablePayableTable
                projectId={projectId}
                transactionType={derivedType}
                businessForm={businessForm}
              />
            </div>
            <div className="w-[450px] shrink-0">
              {formContent}
              <DialogFooter>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full bg-ink text-white shadow-sm transition-[background-color,transform] hover:bg-ink/90 active:scale-[0.98] rounded-full"
                >
                  {isSubmitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "确认记账"
                  )}
                </Button>
              </DialogFooter>
            </div>
          </div>
        ) : (
          <>
            {formContent}
            <DialogFooter>
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="w-full bg-ink text-white shadow-sm transition-[background-color,transform] hover:bg-ink/90 active:scale-[0.98] rounded-full"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "确认记账"
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default RecordDialog;
