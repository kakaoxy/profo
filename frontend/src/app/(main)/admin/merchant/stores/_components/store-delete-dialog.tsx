"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { Field } from "@/app/(main)/admin/_components/field";
import { SteepButton, SteepInput } from "@/components/custom/steep-controls";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
      <DialogContent
        showCloseButton={false}
        className="rounded-[24px] border-0 bg-pure-white p-6 shadow-steep sm:max-w-[440px]"
      >
        <DialogHeader className="gap-2">
          <div className="flex items-start justify-between gap-4">
            <DialogTitle className="text-[26px] leading-[1.18] font-[500] tracking-[-0.009em] text-ink">
              删除门店
            </DialogTitle>
            <DialogClose asChild>
              <SteepButton variant="icon" aria-label="关闭删除门店弹窗" disabled={submitting}>
                <X />
              </SteepButton>
            </DialogClose>
          </div>
          <DialogDescription className="text-[15px] leading-[1.5] text-graphite">
            将软删除「{store?.store_name ?? ""}」：记录保留可追溯，列表与选择器不再展示。存在拜访、绑定、线索或协议的门店不能删除，请改用停用。
          </DialogDescription>
        </DialogHeader>

        <Field label="删除原因" required className="mt-2">
          <SteepInput
            aria-label="删除原因"
            placeholder="请说明删除原因，便于后续追溯"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>

        {error ? (
          <p className="rounded-[16px] bg-apricot-wash px-4 py-3 text-[14px] leading-[1.5] text-rust">
            {error}
          </p>
        ) : null}

        <DialogFooter className="mt-2 flex-row justify-end gap-4 sm:justify-end">
          <DialogClose asChild>
            <SteepButton variant="text" disabled={submitting}>
              取消
            </SteepButton>
          </DialogClose>
          <SteepButton
            variant="primary"
            onClick={() => void submit()}
            disabled={submitting || !reason.trim()}
          >
            {submitting ? "删除中…" : "确认删除"}
          </SteepButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
