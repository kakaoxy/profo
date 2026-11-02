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
 * 公司软删除确认（REQ-IT7-02）.
 *
 * 公司下仍有门店时后端返回 409，前端直接展示后端原因（提示先处理门店或改用停用）。
 */
export function CompanyDeleteDialog({
  company,
  onOpenChange,
  onDeleted,
}: {
  company: { id: string; company_name: string } | null;
  onOpenChange: (open: boolean) => void;
  onDeleted: () => void;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (company) {
      setReason("");
      setError("");
    }
  }, [company]);

  const submit = async () => {
    if (!company || !reason.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await merchantApi(`/admin/merchant/companies/${company.id}/delete`, {
        method: "POST",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      onOpenChange(false);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "删除公司失败");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={Boolean(company)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>删除公司</DialogTitle>
          <DialogDescription>
            将软删除「{company?.company_name ?? ""}」：记录保留可追溯，列表与新建门店的公司选择不再展示。公司下仍有门店时不能删除。
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
