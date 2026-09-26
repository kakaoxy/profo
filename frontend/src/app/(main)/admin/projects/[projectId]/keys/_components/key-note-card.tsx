"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";

import { getApiErrorMessage } from "./constants";
import type { KeysDetailResponse } from "./constants";

interface KeyNoteCardProps {
  projectId: string;
  keyNote: string | null;
  /** 保存成功后（响应返回最新 detail）就地更新 */
  onDetail: (next: KeysDetailResponse) => void;
}

/**
 * 带看注意事项卡（房源级备注）：多行展示 + 编辑 Dialog。
 * 备注实时展示于经纪人钥匙分享页中部；提交空串即清空，分享页卡片随之隐藏。
 */
export function KeyNoteCard({ projectId, keyNote, onDetail }: KeyNoteCardProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 打开弹层时预填当前备注
  useEffect(() => {
    if (dialogOpen) {
      setNote(keyNote ?? "");
    }
  }, [dialogOpen, keyNote]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data, error } = await client.PUT("/api/v1/projects/{project_id}/keys/note", {
        params: { path: { project_id: projectId } },
        body: { note: note.trim() },
      });
      if (error || !data) {
        toast.error(getApiErrorMessage(error, "保存注意事项失败"));
        return;
      }
      onDetail(extractApiData<KeysDetailResponse>(data));
      toast.success("注意事项已保存");
      setDialogOpen(false);
    } catch {
      toast.error("保存注意事项失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-cards bg-pure-white p-6 shadow-steep">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-[500] text-ink">带看注意事项</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => setDialogOpen(true)}
        >
          编辑
        </Button>
      </div>

      <p
        className={`mt-3 whitespace-pre-wrap text-sm font-[430] leading-[1.65] ${
          keyNote ? "text-ash" : "text-graphite"
        }`}
      >
        {keyNote || "未设置，编辑后将在经纪人分享页中部展示。"}
      </p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-cards sm:max-w-md">
          <DialogHeader>
            <DialogTitle>编辑注意事项</DialogTitle>
            <DialogDescription>
              将在经纪人分享页中部展示，提醒带看注意事项；清空后不再展示。
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={200}
            rows={4}
            placeholder="如：门锁位置、进门注意事项等"
            autoFocus
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
