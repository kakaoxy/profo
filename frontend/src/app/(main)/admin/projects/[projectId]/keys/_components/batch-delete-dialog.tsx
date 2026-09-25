"use client";

import { useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { client } from "@/lib/api-client";
import { extractApiData } from "@/lib/api-helpers";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { getApiErrorMessage } from "./constants";
import type { NormalKeyBatchDeleteResponse, NormalKeyItem } from "./constants";

interface BatchDeleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** 待删除的选中密码组 */
  keys: NormalKeyItem[];
  /** 删除成功后回调（父组件重拉 detail 并清空选择） */
  onDeleted: () => Promise<void> | void;
}

/**
 * 批量删除确认 Dialog（Task 6）：显示已选组数；含分享中的组时提示经纪人端影响。
 * 请求体为裸 JSON 数组 [id, ...]（后端契约）。
 */
export function BatchDeleteDialog({
  open,
  onOpenChange,
  projectId,
  keys,
  onDeleted,
}: BatchDeleteDialogProps) {
  const [submitting, setSubmitting] = useState(false);
  const shareActiveCount = keys.filter((key) => key.share_active).length;

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await client.POST(
        "/api/v1/projects/{project_id}/keys/normal/batch-delete",
        {
          params: { path: { project_id: projectId } },
          body: keys.map((key) => key.id),
        },
      );
      if (error || !data) {
        toast.error(getApiErrorMessage(error, "批量删除失败"));
        return;
      }
      const result = extractApiData<NormalKeyBatchDeleteResponse>(data);
      toast.success(`已删除 ${result.deleted_count} 组密码`);
      onOpenChange(false);
      await onDeleted();
    } catch {
      toast.error("批量删除失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-cards sm:max-w-md">
        <DialogHeader>
          <DialogTitle>批量删除密码</DialogTitle>
          <DialogDescription>即将删除已选 {keys.length} 组密码，删除后不可恢复。</DialogDescription>
        </DialogHeader>
        {shareActiveCount > 0 && (
          <div className="flex gap-2.5 rounded-[14px] border border-[#f0dcd2] bg-[#fdf4ef] px-[15px] py-[13px] text-[13.5px] font-[430] leading-[1.55] text-rust">
            <AlertTriangle className="mt-[2px] h-4 w-4 shrink-0" />
            <span>
              所选密码组中 {shareActiveCount} 组仍在分享中，删除后经纪人端将显示“密码已失效”
            </span>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={submitting || keys.length === 0}
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            确认删除
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
