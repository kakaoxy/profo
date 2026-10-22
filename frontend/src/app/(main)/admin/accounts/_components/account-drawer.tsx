"use client";

/**
 * 新建 / 编辑账户抽屉（设计稿屏 3）.
 *
 * 只有四样必填：名字、类型、起始金额、从哪天算——其余（卡号/开户人/备注）都可空，
 * 「填后四位就够」是刻意的低摩擦设计（账户名才是日常识别依据）。
 * 编辑时改期初会提示「改完变成 ¥X」，并引导去核对而不是直接改余额。
 */

import * as React from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCNY, todayISO } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { createAccount, updateAccount } from "../actions";
import {
  ACCOUNT_HOLDER_MAX,
  ACCOUNT_NAME_MAX,
  ACCOUNT_NO_MAX,
  ACCOUNT_NOTE_MAX,
  accountCreateSchema,
  isUnlockDenied,
} from "./account-schema";
import { useModuleLock } from "./module-lock-context";
import { ACCOUNT_TYPES, AccountGlyph, type FundAccount, type FundAccountType } from "./account-card";

const TYPE_KEYS = Object.keys(ACCOUNT_TYPES) as FundAccountType[];

interface AccountDrawerProps {
  open: boolean;
  /** 传入则为编辑模式 */
  account: FundAccount | null;
  token: string | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function AccountDrawer({
  open,
  account,
  token,
  onOpenChange,
  onSaved,
}: AccountDrawerProps) {
  const { invalidate } = useModuleLock();
  const isEdit = Boolean(account);
  const [name, setName] = React.useState("");
  const [type, setType] = React.useState<FundAccountType>("bank");
  const [accountNo, setAccountNo] = React.useState("");
  const [holder, setHolder] = React.useState("");
  const [opening, setOpening] = React.useState("");
  const [openingDate, setOpeningDate] = React.useState("");
  const [status, setStatus] = React.useState<"active" | "off">("active");
  const [note, setNote] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  const today = React.useMemo(() => todayISO(), []);

  React.useEffect(() => {
    if (!open) return;
    setName(account?.name ?? "");
    setType(account?.type ?? "bank");
    setAccountNo(account?.account_no ?? "");
    setHolder(account?.holder ?? "");
    setOpening(account ? String(account.opening_balance) : "");
    setOpeningDate(account?.opening_date ?? today);
    setStatus(account?.status ?? "active");
    setNote(account?.note ?? "");
    setErrors({});
  }, [open, account, today]);

  // 编辑时改期初后的预览余额（差额直接叠加，实际以服务端返回为准）
  const openingDelta =
    isEdit && account ? (Number(opening) || 0) - Number(account.opening_balance) : 0;
  const previewBalance = isEdit && account ? Number(account.balance) + openingDelta : 0;

  const handleSubmit = async () => {
    const payload = {
      name: name.trim(),
      type,
      account_no: accountNo.trim() || null,
      holder: holder.trim() || null,
      opening_balance: opening === "" ? Number.NaN : Number(opening),
      opening_date: openingDate,
      status,
      note: note.trim() || null,
    };

    const parsed = accountCreateSchema.safeParse(payload);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setSubmitting(true);
    const res = isEdit
      ? await updateAccount(account!.id, payload, token)
      : await createAccount(payload, token);
    setSubmitting(false);

    if (!res.success) {
      // 令牌失效（403 未解锁）→ 回锁屏，否则用户会在一个「已失效」的抽屉里反复重试
      if (isUnlockDenied(res.code, res.error)) {
        invalidate();
        return;
      }
      toast.error(res.error);
      setErrors({ name: res.error });
      return;
    }
    toast.success(isEdit ? "改好了" : "建好了 · 现在就能记账");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto border-l-0 bg-white p-0 sm:max-w-[560px]"
      >
        <SheetHeader className="gap-2 border-b border-dove/20 px-7 py-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle className="text-[20px] font-medium tracking-[-0.012em] text-ink">
                {isEdit ? "改账户" : "新建账户"}
              </SheetTitle>
              <SheetDescription className="mt-1.5 text-[12.5px] leading-relaxed text-graphite">
                只记人民币。存好就能记账用。
              </SheetDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full text-graphite hover:bg-ink/5 hover:text-ink"
              aria-label="关闭"
              onClick={() => onOpenChange(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        <div className="flex flex-col gap-5 px-7 py-6">
          {/* 名字 */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">
                起个名字 <span className="text-destructive">*</span>
              </Label>
              <span className="text-[11.5px] text-dove">
                {name.length}/{ACCOUNT_NAME_MAX}
              </span>
            </div>
            <Input
              value={name}
              maxLength={ACCOUNT_NAME_MAX}
              onChange={(event) => setName(event.target.value)}
              placeholder="如：工商银行 · 基本户"
              className="h-11 rounded-inputs"
              aria-invalid={Boolean(errors.name)}
              autoFocus
            />
            {errors.name ? (
              <span className="flex items-center gap-1 text-[11.5px] text-destructive">
                <AlertTriangle className="h-3 w-3" />
                {errors.name}
              </span>
            ) : (
              <span className="text-[11.5px] text-graphite">银行 + 用途，好认就行。</span>
            )}
          </div>

          {/* 类型 */}
          <div className="grid gap-2">
            <Label className="text-xs text-muted-foreground">
              什么账户 <span className="text-destructive">*</span>
            </Label>
            <div className="grid grid-cols-5 gap-2">
              {TYPE_KEYS.map((key) => {
                const selected = type === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setType(key)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-inputs px-1.5 py-3 text-center transition-colors",
                      selected
                        ? "bg-fog ring-[1.5px] ring-ink"
                        : "bg-fog/60 ring-1 ring-dove/20 hover:bg-fog",
                    )}
                    aria-pressed={selected}
                  >
                    <AccountGlyph type={key} size={30} />
                    <span
                      className={cn(
                        "text-[12.5px]",
                        selected ? "font-medium text-ink" : "text-ash",
                      )}
                    >
                      {ACCOUNT_TYPES[key].label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 卡号 / 开户人 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">卡号</Label>
              <Input
                value={accountNo}
                maxLength={ACCOUNT_NO_MAX}
                onChange={(event) => setAccountNo(event.target.value)}
                placeholder="6222 **** 4821"
                className="h-11 rounded-inputs"
              />
              <span className="text-[11.5px] text-graphite">填后四位就够。</span>
            </div>
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">谁的卡</Label>
              <Input
                value={holder}
                maxLength={ACCOUNT_HOLDER_MAX}
                onChange={(event) => setHolder(event.target.value)}
                placeholder="公司名 或 个人姓名"
                className="h-11 rounded-inputs"
              />
              <span className="text-[11.5px] text-graphite">公司的就写公司。</span>
            </div>
          </div>

          {/* 期初金额 / 起算日期 */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">
                起始金额 <span className="text-destructive">*</span>
              </Label>
              <div
                className={cn(
                  "flex h-11 items-center overflow-hidden rounded-inputs bg-fog",
                  errors.opening_balance ? "ring-[1.5px] ring-destructive" : "ring-1 ring-transparent",
                )}
              >
                <span className="px-3 text-[13px] font-semibold text-graphite">¥</span>
                <input
                  inputMode="decimal"
                  value={opening}
                  onChange={(event) => setOpening(event.target.value.replace(/[^\d.-]/g, ""))}
                  placeholder="0.00"
                  className="min-w-0 flex-1 bg-transparent pr-3 text-[13.5px] tabular-nums text-ink outline-none placeholder:text-dove"
                />
              </div>
              {errors.opening_balance ? (
                <span className="text-[11.5px] text-destructive">{errors.opening_balance}</span>
              ) : (
                <span className="text-[11.5px] text-graphite">开始用它那天有多少。</span>
              )}
            </div>
            <div className="grid gap-2">
              <Label className="text-xs text-muted-foreground">
                从哪天算 <span className="text-destructive">*</span>
              </Label>
              <Input
                type="date"
                value={openingDate}
                onChange={(event) => setOpeningDate(event.target.value)}
                className="h-11 rounded-inputs"
              />
              {errors.opening_date ? (
                <span className="text-[11.5px] text-destructive">{errors.opening_date}</span>
              ) : (
                <span className="text-[11.5px] text-graphite">之前的账不算。</span>
              )}
            </div>
          </div>

          {isEdit && openingDelta !== 0 ? (
            <div className="flex items-start gap-2 rounded-2xl bg-apricot-wash px-4 py-3 text-[12.5px] leading-relaxed text-rust">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                改完变成 <b>{formatCNY(previewBalance)}</b>。想和银行对上，请去核对。
              </span>
            </div>
          ) : null}

          {/* 状态 */}
          <div className="grid gap-2">
            <Label className="text-xs text-muted-foreground">状态</Label>
            <div className="flex gap-2.5">
              {(
                [
                  { value: "active", title: "在用", sub: "记账时能选到" },
                  { value: "off", title: "停用", sub: "留着旧账，不再记新的" },
                ] as const
              ).map((option) => {
                const selected = status === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatus(option.value)}
                    className={cn(
                      "flex flex-1 items-center gap-2.5 rounded-inputs px-3.5 py-3 text-left transition-colors",
                      selected
                        ? "bg-fog ring-[1.5px] ring-ink"
                        : "bg-fog/60 ring-1 ring-dove/20 hover:bg-fog",
                    )}
                    aria-pressed={selected}
                  >
                    <span
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                        selected ? "bg-ink" : "ring-1 ring-dove/50",
                      )}
                      aria-hidden="true"
                    >
                      {selected ? <i className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
                    </span>
                    <span>
                      <span className="block text-[13.5px] font-medium text-ink">{option.title}</span>
                      <span className="block text-[11.5px] text-graphite">{option.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 备注 */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs text-muted-foreground">备注</Label>
              <span className="text-[11.5px] text-dove">
                {note.length}/{ACCOUNT_NOTE_MAX}
              </span>
            </div>
            <Textarea
              value={note}
              maxLength={ACCOUNT_NOTE_MAX}
              onChange={(event) => setNote(event.target.value)}
              placeholder="它一般用来干什么"
              className="min-h-19 rounded-inputs bg-fog text-[13.5px] leading-relaxed"
            />
          </div>

          {!isEdit ? (
            <div className="flex items-start gap-2 rounded-2xl bg-sky-wash px-4 py-3 text-[12.5px] leading-relaxed text-[#2b5391]">
              <span>存好后随便记一笔试试，能选到就通了。</span>
            </div>
          ) : null}
        </div>

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-dove/20 px-7 py-4">
          <span className="text-[12px] text-graphite">
            {isEdit ? "改动会留记录" : "建好即可记账"}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              className="rounded-full bg-ink text-white hover:bg-ink/90"
              onClick={handleSubmit}
              disabled={submitting}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : isEdit ? "保存" : "建好"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
