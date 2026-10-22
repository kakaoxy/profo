"use client";

/**
 * 余额核对弹窗（设计稿屏 3）.
 *
 * 设计意图：余额不能直接改，只能「核对」。用户填银行 App 里的真实数字，系统算差额并
 * 留一条调整记录（谁调的 / 为什么 / 哪天）。差额为 0 时按钮禁用——对上了就不该留痕。
 */

import * as React from "react";
import { AlertTriangle, Loader2, Scale } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCNY } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createAdjustment } from "../actions";
import { adjustmentCreateSchema, isUnlockDenied } from "./account-schema";
import { useModuleLock } from "./module-lock-context";
import { type FundAccount } from "./account-card";

interface ReconDialogProps {
  open: boolean;
  accounts: FundAccount[];
  /** 打开时默认选中的账户 */
  defaultAccountId: string | null;
  token: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function ReconDialog({
  open,
  accounts,
  defaultAccountId,
  token,
  onOpenChange,
  onSaved,
}: ReconDialogProps) {
  const { invalidate } = useModuleLock();
  const [accountId, setAccountId] = React.useState("");
  const [actual, setActual] = React.useState("");
  const [date, setDate] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  const today = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  React.useEffect(() => {
    if (!open) return;
    setAccountId(defaultAccountId ?? accounts[0]?.id ?? "");
    setActual("");
    setDate(today);
    setReason("");
    setErrors({});
  }, [open, defaultAccountId, accounts, today]);

  const account = accounts.find((item) => item.id === accountId) ?? null;
  const systemBalance = account ? Number(account.balance) : 0;
  const diff = actual === "" ? null : (Number(actual) || 0) - systemBalance;

  const handleSubmit = async () => {
    if (!account) return;
    const parsed = adjustmentCreateSchema.safeParse({
      adjust_date: date,
      actual_balance: actual === "" ? Number.NaN : Number(actual),
      reason,
    });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    if (diff === 0) {
      setErrors({ actual_balance: "实际余额与系统一致，无需调整" });
      return;
    }

    setSubmitting(true);
    const res = await createAdjustment(account.id, parsed.data, token);
    setSubmitting(false);
    if (!res.success) {
      // 令牌失效（403 未解锁）→ 回锁屏；权限不足/差额为 0 等业务错误留在弹窗提示
      if (isUnlockDenied(res.code, res.error)) {
        invalidate();
        return;
      }
      toast.error(res.error);
      setErrors({ actual_balance: res.error });
      return;
    }
    toast.success(`核对已记录 ${Number(res.data.amount) > 0 ? "+" : "−"}${formatCNY(Math.abs(Number(res.data.amount)))}`);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-125 rounded-[20px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[17px] font-medium tracking-[-0.009em] text-ink">
            <Scale className="h-4 w-4" aria-hidden="true" />
            核对余额
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-graphite">
            把银行卡里的真实数字填进来，差多少系统自己算。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label className="text-xs text-muted-foreground">
              哪个账户 <span className="text-destructive">*</span>
            </Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger className="h-11 w-full rounded-inputs">
                <SelectValue placeholder="选择账户" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                    {item.status === "off" ? "（已停用）" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3.5 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">账上有的</Label>
              <div className="flex h-11.5 items-center rounded-inputs bg-fog px-3.5 text-[15px] font-[480] tabular-nums text-ink">
                {formatCNY(systemBalance)}
              </div>
              <span className="text-[11.5px] text-graphite">起始 + 进 − 出 ± 核对</span>
            </div>
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">
                实际金额 <span className="text-destructive">*</span>
              </Label>
              <div
                className={cn(
                  "flex h-11.5 items-center overflow-hidden rounded-inputs bg-fog",
                  errors.actual_balance ? "ring-[1.5px] ring-destructive" : "ring-1 ring-transparent",
                )}
              >
                <span className="px-3 text-[13px] font-semibold text-graphite">¥</span>
                <input
                  inputMode="decimal"
                  value={actual}
                  onChange={(event) => {
                    setActual(event.target.value.replace(/[^\d.-]/g, ""));
                    setErrors((prev) => ({ ...prev, actual_balance: "" }));
                  }}
                  placeholder="0.00"
                  className="min-w-0 flex-1 bg-transparent pr-3 text-[13.5px] tabular-nums text-ink outline-none placeholder:text-dove"
                />
              </div>
              {errors.actual_balance ? (
                <span className="flex items-center gap-1 text-[11.5px] text-destructive">
                  <AlertTriangle className="h-3 w-3" />
                  {errors.actual_balance}
                </span>
              ) : (
                <span className="text-[11.5px] text-graphite">看手机银行。</span>
              )}
            </div>
          </div>

          {/* 差额预览 */}
          <div
            className={cn(
              "flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5",
              diff === null
                ? "bg-fog"
                : diff === 0
                  ? "bg-sky-wash/50"
                  : "bg-apricot-wash",
            )}
          >
            <div>
              <div
                className={cn(
                  "text-[12px]",
                  diff === null ? "text-graphite" : diff === 0 ? "text-graphite" : "text-rust/72",
                )}
              >
                差多少
              </div>
              <div className="mt-0.5 text-[12px] text-graphite">
                {diff === null ? "填了就自动算" : diff === 0 ? "对上了，不用调 ✓" : "会记一条调整"}
              </div>
            </div>
            <div
              className={cn(
                "text-[26px] leading-none font-[480] tracking-[-0.02em] tabular-nums",
                diff === null ? "text-dove" : diff === 0 ? "text-[#2b5391]" : "text-rust",
              )}
            >
              {diff === null ? "—" : diff === 0 ? formatCNY(0) : `${diff > 0 ? "+" : "−"}${formatCNY(Math.abs(diff))}`}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">
                哪天 <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="h-11 rounded-inputs"
              />
              {errors.adjust_date ? (
                <span className="text-[11.5px] text-destructive">{errors.adjust_date}</span>
              ) : null}
            </div>
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">凭证</Label>
              <div className="flex h-11 items-center rounded-inputs bg-fog px-3.5 text-[12.5px] text-graphite">
                截图可后补（本期未接入上传）
              </div>
            </div>
          </div>

          <div className="grid gap-2">
            <Label className="text-xs text-muted-foreground">
              为什么差 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setErrors((prev) => ({ ...prev, reason: "" }));
              }}
              placeholder="手续费没记 / 找零漏了 / 到账晚了一天"
              className="min-h-18 rounded-inputs bg-fog text-[13.5px] leading-relaxed"
            />
            {errors.reason ? (
              <span className="text-[11.5px] text-destructive">{errors.reason}</span>
            ) : (
              <span className="text-[11.5px] text-graphite">半年后自己还能看懂就行。</span>
            )}
          </div>

          <p className="rounded-2xl bg-fog px-4 py-3 text-[12.5px] leading-relaxed text-graphite">
            只改账户余额，不动项目盈亏。
          </p>
        </div>

        <DialogFooter className="items-center justify-between gap-3 sm:justify-between">
          <span className="text-[12px] text-graphite">操作会留记录 · 记录只加不改不删</span>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              className="rounded-full bg-ink text-white hover:bg-ink/90"
              onClick={handleSubmit}
              disabled={submitting || diff === null || diff === 0}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "确认"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
