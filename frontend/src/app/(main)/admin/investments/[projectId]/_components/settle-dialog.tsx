"use client";

/**
 * 结算对话框（Phase 5.2）
 *
 * 顶部展示项目信息与状态流转图（未结算 → 已结算）
 * 字段：结算说明（可选）、结算日期（默认今天，必填）
 * 确认调用 settleInvestment Server Action
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ArrowRight, CheckCircle2 } from "lucide-react";
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
import { settleInvestment } from "../../actions";
import type { components } from "@/lib/api-types";

type InvestmentResponse = components["schemas"]["InvestmentResponse"];

interface SettleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investment: InvestmentResponse;
}

/** 返回今天 YYYY-MM-DD（本地时区） */
function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function SettleDialog({ open, onOpenChange, investment }: SettleDialogProps) {
  const router = useRouter();
  const [settledNote, setSettledNote] = React.useState("");
  const [settledDate, setSettledDate] = React.useState(todayISO());
  const [submitting, setSubmitting] = React.useState(false);

  // 打开时重置
  React.useEffect(() => {
    if (open) {
      setSettledNote("");
      setSettledDate(todayISO());
    }
  }, [open]);

  const dateValid = !!settledDate && !isNaN(new Date(settledDate).getTime());

  const handleSubmit = async (): Promise<void> => {
    if (!dateValid) {
      toast.error("请选择有效的结算日期");
      return;
    }
    setSubmitting(true);
    try {
      const res = await settleInvestment(investment.id, {
        settled_note: settledNote.trim() || null,
        settled_date: settledDate,
      });
      if (res.success) {
        toast.success("已结算");
        onOpenChange(false);
        // 切回只读模式（清除 ?edit=1）
        router.replace(`/admin/investments/${investment.project_id}`);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("结算失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] grid-rows-[auto_auto_1fr_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>结算跟投记录</DialogTitle>
          <DialogDescription className="text-xs">
            结算后跟投记录将变为只读，如需修改请先反结算
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          {/* 项目信息 */}
          <div className="rounded-lg border border-border bg-muted/40 p-4 space-y-1.5">
            <div className="text-sm font-medium text-foreground">
              {investment.project_name || "-"}
            </div>
            <div className="text-xs text-muted-foreground font-mono">
              编号：{investment.project_code || "-"}
            </div>
          </div>

          {/* 状态流转图 */}
          <div className="flex items-center justify-center gap-3 py-2">
            <div className="flex items-center gap-1.5 rounded-md bg-blue-500/10 px-3 py-1.5 text-xs font-medium text-blue-600">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              未结算
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground" />
            <div className="flex items-center gap-1.5 rounded-md bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-600">
              <CheckCircle2 className="h-3.5 w-3.5" />
              已结算
            </div>
          </div>

          {/* 结算日期 */}
          <div className="space-y-2">
            <Label>
              结算日期 <span className="text-red-500">*</span>
            </Label>
            <Input
              type="date"
              value={settledDate}
              onChange={(e) => setSettledDate(e.target.value)}
              aria-invalid={!dateValid}
            />
            {!dateValid && <p className="text-xs text-red-500">请选择有效的日期</p>}
          </div>

          {/* 结算说明 */}
          <div className="space-y-2">
            <Label>结算说明</Label>
            <Textarea
              placeholder="选填，记录结算相关说明"
              value={settledNote}
              onChange={(e) => setSettledNote(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t border-border bg-card gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !dateValid}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                提交中...
              </>
            ) : (
              "确认结算"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
