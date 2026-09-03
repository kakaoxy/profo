"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { LeadEliminateReason } from "../../_lib/flow-constants";
import { ELIMINATE_REASONS } from "../../_lib/flow-constants";

/** 流转确认弹窗模式：eliminate=淘汰（原因必选 + 备注选填）；reactivate=重新激活（备注必填） */
export type FlowConfirmMode = "eliminate" | "reactivate";

interface FlowConfirmDialogProps {
  /** 弹窗模式（null 表示关闭） */
  mode: FlowConfirmMode | null;
  /** 提交中（确认按钮禁用 + loading） */
  submitting: boolean;
  /** 淘汰旁路是否必选原因（recruit 非必选，后端忽略其 reason；其余模块 422 必填） */
  reasonRequired: boolean;
  /** 确认回调（reason/remark 已通过前端必填拦截） */
  onConfirm: (payload: { reason: LeadEliminateReason | null; remark: string }) => void;
  /** 关闭回调 */
  onClose: () => void;
}

/**
 * 淘汰 / 重新激活旁路流转确认弹窗（表格行与详情抽屉共用）：
 * 淘汰需必选原因（reasonRequired 时前端拦截未选不提交）+ 备注选填；
 * 重新激活（eliminated → contacted）备注必填（前端拦截 + 后端 422 双保险）。
 */
export function FlowConfirmDialog({
  mode,
  submitting,
  reasonRequired,
  onConfirm,
  onClose,
}: FlowConfirmDialogProps) {
  const [reason, setReason] = React.useState<LeadEliminateReason | null>(null);
  const [remark, setRemark] = React.useState("");

  // 每次打开重置表单
  React.useEffect(() => {
    if (mode) {
      setReason(null);
      setRemark("");
    }
  }, [mode]);

  if (!mode) return null;

  const isEliminate = mode === "eliminate";
  const canSubmit = isEliminate
    ? !reasonRequired || reason !== null
    : remark.trim().length > 0;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogTitle className="text-base font-medium text-ink">
          {isEliminate ? "淘汰线索" : "重新激活线索"}
        </DialogTitle>
        <DialogDescription className="text-[13px] text-graphite">
          {isEliminate
            ? "确认后线索转为「已淘汰」，请选择淘汰原因"
            : "重新激活后线索恢复为「已联系」，请填写备注说明原因"}
        </DialogDescription>

        {isEliminate && (
          <div className="flex flex-col gap-2">
            <div className="text-[12.5px] text-graphite">
              淘汰原因（{reasonRequired ? "必选" : "选填"}）
            </div>
            <div className="flex flex-wrap gap-2">
              {ELIMINATE_REASONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setReason(opt.value)}
                  className={cn(
                    "h-9 px-4 rounded-full border text-[14px] transition-colors",
                    reason === opt.value
                      ? "bg-ink border-ink text-white font-medium"
                      : "bg-white border-fog text-graphite hover:border-dove",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            maxLength={500}
            placeholder={isEliminate ? "备注（选填，≤500字）" : "备注（必填，≤500字）"}
            className="rounded-inputs border-dove bg-white text-[14px] min-h-20 focus-visible:ring-ink/30"
            aria-label="流转备注"
          />
          {!canSubmit && (
            <p className="text-[12.5px] text-rust">
              {isEliminate
                ? reasonRequired
                  ? "请先选择淘汰原因"
                  : null
                : "请填写备注后再提交"}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="text-[14px] font-medium text-ink px-0.5 hover:opacity-60 transition-opacity"
          >
            取消
          </button>
          <button
            type="button"
            disabled={!canSubmit || submitting}
            onClick={() => onConfirm({ reason, remark })}
            className="h-9 px-4 rounded-[10px] bg-ink text-white text-[13px] font-medium inline-flex items-center gap-1 hover:opacity-85 transition-opacity disabled:opacity-35 disabled:cursor-not-allowed"
          >
            {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
            确认流转
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
