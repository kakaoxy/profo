"use client";

/**
 * 补挂 / 换挂账户弹窗（设计稿屏 3'）.
 *
 * 使用场景：存量流水的 `account_id` 为空（历史数据不做事后猜测回填），或当初挂错账户。
 * 约束：只改归属，金额与日期不动；补上后账户余额立即跟着变（余额由流水推导）。
 * 停用账户不出现在可选列表（停用不能再记新账，但历史账单已在它名下）。
 */

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCNY } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fixRecordAccount } from "../actions";
import { AccountGlyph, type FundAccount } from "./account-card";

interface FixAccountDialogProps {
  open: boolean;
  /** 待补挂的流水（record_id + 方向 + 金额 + 展示文案） */
  record: {
    record_id: string;
    project_name?: string | null;
    subject_name?: string | null;
    record_date: string;
    outflow?: number;
    inflow?: number;
    account_id?: string | null;
  } | null;
  accounts: FundAccount[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export function FixAccountDialog({
  open,
  record,
  accounts,
  onOpenChange,
  onSaved,
}: FixAccountDialogProps) {
  const [accountId, setAccountId] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open || !record) return;
    setAccountId(record.account_id ?? "");
  }, [open, record]);

  const isOutflow = (record?.outflow ?? 0) > 0;
  const amount = isOutflow ? (record?.outflow ?? 0) : (record?.inflow ?? 0);
  // 只为「在用」账户提供选择：停用账户不能再承接新记账
  const activeAccounts = accounts.filter((item) => item.status === "active");

  const handleSubmit = async () => {
    if (!record || !accountId) return;
    setSubmitting(true);
    const res = await fixRecordAccount(record.record_id, accountId);
    setSubmitting(false);
    if (!res.success) {
      toast.error(res.error);
      return;
    }
    toast.success("已挂上账户");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-115 rounded-[20px]">
        <DialogHeader>
          <DialogTitle className="text-[17px] font-medium tracking-[-0.009em] text-ink">
            {record?.account_id ? "换个账户" : "补上账户"}
          </DialogTitle>
          <DialogDescription className="text-[12.5px] leading-relaxed text-graphite">
            {record ? `${record.record_date} · ${record.project_name ?? "—"} · ${record.subject_name ?? "—"}` : ""}
            {amount > 0 ? ` · ${formatCNY(amount)}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <span className="text-xs text-muted-foreground">
            {isOutflow ? "钱从哪个账户出" : "钱进哪个账户"} <span className="text-destructive">*</span>
          </span>
          {activeAccounts.length === 0 ? (
            <p className="rounded-2xl bg-apricot-wash px-4 py-3 text-[12.5px] text-rust">
              没有在用账户，请先新建一个。
            </p>
          ) : (
            <div className="grid max-h-80 gap-1.5 overflow-y-auto pr-1">
              {activeAccounts.map((account) => {
                const selected = accountId === account.id;
                return (
                  <button
                    key={account.id}
                    type="button"
                    onClick={() => setAccountId(account.id)}
                    className={cn(
                      "flex items-center gap-2.5 rounded-inputs px-3 py-2.5 text-left transition-colors",
                      selected ? "bg-fog ring-[1.5px] ring-ink" : "hover:bg-fog/70",
                    )}
                    aria-pressed={selected}
                  >
                    <AccountGlyph type={account.type} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13.5px] font-medium text-ink">{account.name}</div>
                      <div className="truncate font-mono text-[11.5px] text-graphite">
                        {account.account_no || "—"}
                      </div>
                    </div>
                    <div className="shrink-0 text-[12.5px] tabular-nums text-graphite">
                      {formatCNY(account.balance)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
          <p className="mt-1 rounded-2xl bg-fog px-4 py-3 text-[12.5px] leading-relaxed text-graphite">
            补上后余额会跟着变，金额和日期不动。
          </p>
        </div>

        <DialogFooter className="items-center justify-between gap-3 sm:justify-between">
          <span className="text-[12px] text-graphite">改动会写入项目账本日志</span>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              className="rounded-full bg-ink text-white hover:bg-ink/90"
              onClick={handleSubmit}
              disabled={submitting || !accountId}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "保存"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
