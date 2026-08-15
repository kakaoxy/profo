"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { settleProjectLedger, unsettleProjectLedger } from "../../actions";

interface SettlementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  mode: "settle" | "unsettle";
}

/** 返回今天 YYYY-MM-DD（本地时区） */
function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 资金账本结算/反结算合并弹窗
 *
 * - mode="settle"：日期（必填） + 说明（选填）
 * - mode="unsettle"：警示条 + 原因（必填）
 */
export function SettlementDialog({ open, onOpenChange, projectId, mode }: SettlementDialogProps) {
  const router = useRouter();
  const [settledDate, setSettledDate] = React.useState(todayISO());
  const [settledNote, setSettledNote] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // 打开时重置表单，避免上次残留
  React.useEffect(() => {
    if (open) {
      setSettledDate(todayISO());
      setSettledNote("");
      setReason("");
    }
  }, [open]);

  const isSettle = mode === "settle";
  const dateValid = !!settledDate && !isNaN(new Date(settledDate).getTime());
  const reasonValid = reason.trim().length > 0;
  const canSubmit = isSettle ? dateValid : reasonValid;

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) {
      toast.error(isSettle ? "请选择有效的结算日期" : "请填写反结算原因");
      return;
    }
    setSubmitting(true);
    try {
      const res = isSettle
        ? await settleProjectLedger(projectId, {
            settled_date: settledDate,
            settled_note: settledNote.trim() || null,
          })
        : await unsettleProjectLedger(projectId, { reason: reason.trim() });
      if (res.success) {
        toast.success(isSettle ? "已结算" : "已反结算，可继续编辑");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error(isSettle ? "结算失败，请稍后重试" : "反结算失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] grid-rows-[auto_auto_1fr_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>{isSettle ? "结算资金账本" : "反结算资金账本"}</DialogTitle>
          <DialogDescription className="text-xs">
            {isSettle
              ? "结算后资金账本将变为只读，如需修改请先反结算"
              : "反结算后资金账本将恢复可编辑状态，此操作会写入操作日志"}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          {/* 状态流转图：未结算 → 已结算（仅 settle 模式） */}
          {isSettle && (
            <div className="flex items-center justify-center gap-3 py-2">
              <div className="flex items-center gap-1.5 rounded-md bg-fog px-3 py-1.5 text-xs font-medium text-graphite">
                <span className="h-2 w-2 rounded-full bg-graphite" />
                未结算
              </div>
              <ArrowRight className="h-4 w-4 text-graphite" />
              <div className="flex items-center gap-1.5 rounded-md bg-apricot-wash px-3 py-1.5 text-xs font-medium text-rust">
                <CheckCircle2 className="h-3.5 w-3.5" />
                已结算
              </div>
            </div>
          )}

          {/* 警示条（仅 unsettle 模式） */}
          {!isSettle && (
            <div className="flex items-start gap-2 rounded-lg bg-apricot-wash border border-rust/30 px-4 py-3 text-sm text-rust">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                反结算后资金账本将恢复可编辑状态，可继续新增/删除流水记录。此操作会写入操作日志。
              </span>
            </div>
          )}

          {/* 结算日期（仅 settle 模式，必填） */}
          {isSettle && (
            <div className="space-y-2">
              <Label>
                结算日期 <span className="text-rust">*</span>
              </Label>
              <Input
                type="date"
                value={settledDate}
                onChange={(e) => setSettledDate(e.target.value)}
                aria-invalid={!dateValid}
              />
              {!dateValid && <p className="text-xs text-rust">请选择有效的日期</p>}
            </div>
          )}

          {/* 结算说明（仅 settle 模式，选填） */}
          {isSettle && (
            <div className="space-y-2">
              <Label>结算说明</Label>
              <Textarea
                placeholder="选填，记录结算相关说明"
                value={settledNote}
                onChange={(e) => setSettledNote(e.target.value)}
                rows={3}
              />
            </div>
          )}

          {/* 反结算原因（仅 unsettle 模式，必填） */}
          {!isSettle && (
            <div className="space-y-2">
              <Label>
                反结算原因 <span className="text-rust">*</span>
              </Label>
              <Textarea
                placeholder="请填写反结算原因（必填）"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                aria-invalid={!reasonValid}
              />
              {!reasonValid && reason.length > 0 && (
                <p className="text-xs text-rust">原因不可为空</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t border-border bg-card gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
            className={
              isSettle
                ? "bg-ink text-pure-white hover:bg-ink/90"
                : "bg-rust text-pure-white hover:bg-rust/90"
            }
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                提交中...
              </>
            ) : isSettle ? (
              "确认结算"
            ) : (
              "确认反结算"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
