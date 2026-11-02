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
import { merchantApi } from "../../_components/merchant-api";

/**
 * 门店软删除确认（REQ-IT7-01）.
 *
 * 后端存在关联数据时返回 409 并给出可读原因；前端原样展示，不再二次猜测。
 */
export function StoreDeleteDialog({
  store,
  onOpenChange,
  onDeleted,
}: {
  store: { id: string; store_name: string } | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (store) {
      setReason("");
      setError("");
    }
  }, [store]);

  const submit = async () => {
    if (!store || !reason.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await merchantApi(`/admin/merchant/stores/${store.id}/delete`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      onOpenChange(false);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除门店失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={Boolean(store)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>删除门店</DialogTitle>
          <DialogDescription>
            将软删除「{store?.store_name ?? ""}」：记录保留可追溯，列表与选择器不再展示。存在拜访、绑定、线索或协议的门店不能删除，请改用停用。
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Input
            aria-label="删除原因"
            placeholder="请填写删除原因（必填）"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
          {error ? <p className="text-sm text-rust">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={submitting || !reason.trim()}>
            {submitting ? "删除中…" : "确认删除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
