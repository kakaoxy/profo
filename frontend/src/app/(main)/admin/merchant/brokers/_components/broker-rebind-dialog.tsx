"use client";

import { useEffect, useState } from "react";

import { Field } from "@/app/(main)/admin/_components/field";
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
import { BrokerStorePicker } from "./broker-store-picker";

/**
 * 强制换绑弹层（REQ-IT7-03 设计稿）.
 *
 * 换绑会同时写绑定历史与审计，因此新门店与原因都必填；提交后由详情抽屉刷新。
 */
export function BrokerRebindDialog({
  open,
  onOpenChange,
  brokerId,
  brokerName,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brokerId: string | null;
  brokerName: string;
  onDone: () => void;
}) {
  const [storeId, setStoreId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setStoreId("");
    setStoreName("");
    setReason("");
    setError("");
  }, [open]);

  const submit = async () => {
    if (!brokerId) return;
    if (!storeId) {
      setError("请选择新门店");
      return;
    }
    if (!reason.trim()) {
      setError("请填写换绑原因");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await merchantApi(`/admin/merchant/brokers/${brokerId}/change`, {
        method: "POST",
        body: JSON.stringify({ store_id: storeId, reason: reason.trim() }),
      });
      onOpenChange(false);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "换绑失败");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>换绑门店：{brokerName}</DialogTitle>
          <DialogDescription>换绑会写入绑定历史与操作审计，请确认新门店与原因。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <Field label="新门店" required>
            <BrokerStorePicker
              value={storeId}
              selectedName={storeName}
              onChange={(store) => {
                setStoreId(store?.id ?? "");
                setStoreName(store?.store_name ?? "");
              }}
            />
          </Field>
          <Field label="换绑原因" required>
            <Input
              aria-label="换绑原因"
              placeholder="请填写换绑原因（必填）"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        </div>
        {error ? <p className="text-sm text-error">{error}</p> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={() => void submit()} disabled={saving}>
            {saving ? "处理中…" : "确认换绑"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
