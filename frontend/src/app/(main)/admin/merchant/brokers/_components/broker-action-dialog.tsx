"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/**
 * 经纪人动作确认弹层（解绑 / 停用 / 启用）.
 *
 * 所有动作都必须填写原因并写入审计；原因留空时禁用确认按钮，避免出现无凭据操作。
 */
export function BrokerActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  requireReason = true,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  requireReason?: boolean;
  pending: boolean;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const canSubmit = !pending && (!requireReason || reason.trim().length > 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {requireReason ? (
          <Input
            aria-label="操作原因"
            placeholder="请填写操作原因（必填）"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={!canSubmit} onClick={() => onConfirm(reason.trim())}>
            {pending ? "处理中…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
