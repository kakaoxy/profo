"use client";

/**
 * 反结算对话框（Phase 5.3）
 *
 * 顶部展示项目信息与当前状态（已结算）
 * 影响说明：反结算后该项目将恢复可编辑状态
 * 字段：反结算原因（必填，min_length=1）
 * 确认调用 unsettleInvestment Server Action
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { unsettleInvestment } from "../../actions";
import type { components } from "@/lib/api-types";

type InvestmentResponse = components["schemas"]["InvestmentResponse"];

interface UnsettleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  investment: InvestmentResponse;
}

export function UnsettleDialog({
  open,
  onOpenChange,
  investment,
}: UnsettleDialogProps) {
  const router = useRouter();
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const reasonValid = reason.trim().length > 0;

  const handleSubmit = async (): Promise<void> => {
    if (!reasonValid) {
      toast.error("请填写反结算原因");
      return;
    }
    setSubmitting(true);
    try {
      const res = await unsettleInvestment(investment.id, {
        reason: reason.trim(),
      });
      if (res.success) {
        toast.success("已反结算，可继续编辑");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("反结算失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] grid-rows-[auto_auto_1fr_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>反结算跟投记录</DialogTitle>
          <DialogDescription className="text-xs">
            反结算后该项目将恢复可编辑状态，所有投资方与收益分配可修改
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

          {/* 影响说明 */}
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              反结算后该项目将恢复可编辑状态，所有投资方与收益分配可修改。此操作会写入操作日志。
            </span>
          </div>

          {/* 反结算原因 */}
          <div className="space-y-2">
            <Label>
              反结算原因 <span className="text-red-500">*</span>
            </Label>
            <Textarea
              placeholder="请填写反结算原因（必填）"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              aria-invalid={!reasonValid}
            />
            {!reasonValid && reason.length > 0 && (
              <p className="text-xs text-red-500">原因不可为空</p>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t border-border bg-card gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !reasonValid}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                提交中...
              </>
            ) : (
              "确认反结算"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
