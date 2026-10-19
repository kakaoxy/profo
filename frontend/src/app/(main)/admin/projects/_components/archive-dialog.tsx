"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, CheckCircle2, Loader2, Lock } from "lucide-react";
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
import { archiveProjectAction, unarchiveProjectAction } from "../actions/core";

interface ArchiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  mode: "archive" | "unarchive";
  /** 归档成功回调（详情页局部刷新 / 列表页 router.refresh） */
  onSuccess?: () => void;
}

/** 返回今天 YYYY-MM-DD（本地时区，与结算弹窗同口径） */
function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 项目归档 / 反归档合并弹窗（参照 ledger settlement-dialog 双模式形态）
 *
 * - mode="archive"：流转图（已售/已下架 → 已归档）+ 归档日期（必填，默认今天）+ 说明（选填）
 * - mode="unarchive"：警示条 + 原因（必填）
 *
 * 归档后项目全部写接口被后端锁定（更新/状态流转/文书/装修/销售/删除），
 * 反归档后恢复可编辑；两次操作均写 OperationLog 审计。
 */
export function ArchiveDialog({
  open,
  onOpenChange,
  projectId,
  mode,
  onSuccess,
}: ArchiveDialogProps) {
  const router = useRouter();
  const [archivedAt, setArchivedAt] = React.useState(todayISO());
  const [archivedNote, setArchivedNote] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // 打开时重置表单，避免上次残留
  React.useEffect(() => {
    if (open) {
      setArchivedAt(todayISO());
      setArchivedNote("");
      setReason("");
    }
  }, [open]);

  const isArchive = mode === "archive";
  const dateValid =
    /^\d{4}-\d{2}-\d{2}$/.test(archivedAt) && !isNaN(new Date(archivedAt).getTime());
  const reasonValid = reason.trim().length > 0;
  const canSubmit = isArchive ? dateValid : reasonValid;

  const handleSubmit = async (): Promise<void> => {
    if (!canSubmit) {
      toast.error(isArchive ? "请选择有效的归档日期" : "请填写反归档原因");
      return;
    }
    setSubmitting(true);
    try {
      const res = isArchive
        ? await archiveProjectAction(projectId, {
            archived_at: archivedAt,
            archived_note: archivedNote.trim() || null,
          })
        : await unarchiveProjectAction(projectId, { reason: reason.trim() });
      if (res.success) {
        toast.success(res.message || (isArchive ? "项目已归档" : "已反归档"));
        onOpenChange(false);
        onSuccess?.();
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error(isArchive ? "归档失败，请稍后重试" : "反归档失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] grid-rows-[auto_auto_1fr_auto] gap-0 overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6 pb-2">
          <DialogTitle>{isArchive ? "归档项目" : "反归档项目"}</DialogTitle>
          <DialogDescription className="text-xs">
            {isArchive
              ? "归档后项目信息、文书与附件将全部锁定为只读，如需修改请先反归档"
              : "反归档后项目恢复可编辑，此操作会写入操作日志"}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto px-6 py-4 space-y-4">
          {/* 状态流转图：已售/已下架 → 已归档（仅 archive 模式） */}
          {isArchive && (
            <div className="flex items-center justify-center gap-3 py-2">
              <div className="flex items-center gap-1.5 rounded-md bg-fog px-3 py-1.5 text-xs font-medium text-graphite">
                <span className="h-2 w-2 rounded-full bg-graphite" />
                已售 / 已下架
              </div>
              <ArrowRight className="h-4 w-4 text-graphite" />
              <div className="flex items-center gap-1.5 rounded-md bg-apricot-wash px-3 py-1.5 text-xs font-medium text-rust">
                <Lock className="h-3.5 w-3.5" />
                已归档
              </div>
            </div>
          )}

          {/* 警示条（仅 unarchive 模式） */}
          {!isArchive && (
            <div className="flex items-start gap-2 rounded-lg bg-apricot-wash border border-rust/30 px-4 py-3 text-sm text-rust">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                反归档后项目将恢复可编辑（信息、文书、附件、装修、销售记录）。
                此操作会写入操作日志。
              </span>
            </div>
          )}

          {/* 归档日期（仅 archive 模式，必填） */}
          {isArchive && (
            <div className="space-y-2">
              <Label htmlFor="archive-date">
                归档日期 <span className="text-rust">*</span>
              </Label>
              <Input
                id="archive-date"
                type="date"
                value={archivedAt}
                onChange={(e) => setArchivedAt(e.target.value)}
                aria-invalid={!dateValid}
              />
              {!dateValid && <p className="text-xs text-rust">请选择有效的日期</p>}
            </div>
          )}

          {/* 归档说明（仅 archive 模式，选填） */}
          {isArchive && (
            <div className="space-y-2">
              <Label htmlFor="archive-note">归档说明</Label>
              <Textarea
                id="archive-note"
                placeholder="选填，记录归档相关说明（如材料已补齐）"
                value={archivedNote}
                onChange={(e) => setArchivedNote(e.target.value)}
                rows={3}
                maxLength={500}
              />
            </div>
          )}

          {/* 反归档原因（仅 unarchive 模式，必填） */}
          {!isArchive && (
            <div className="space-y-2">
              <Label htmlFor="archive-reason">
                反归档原因 <span className="text-rust">*</span>
              </Label>
              <Textarea
                id="archive-reason"
                placeholder="请填写反归档原因（必填）"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                aria-invalid={!reasonValid}
              />
              {!reasonValid && reason.length > 0 && (
                <p className="text-xs text-rust">原因不可为空</p>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 border-t border-dove bg-white px-6 py-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting || !canSubmit}
            className={
              isArchive
                ? "bg-ink text-pure-white hover:bg-ink/90"
                : "bg-rust text-pure-white hover:bg-rust/90"
            }
          >
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                提交中...
              </>
            ) : isArchive ? (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                确认归档
              </>
            ) : (
              "确认反归档"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
