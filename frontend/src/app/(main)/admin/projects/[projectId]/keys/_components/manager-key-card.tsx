"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { client } from "@/lib/api-client";
import { extractApiData } from "@/lib/api-helpers";
import { safeFormatDate } from "@/lib/formatters";
import { Badge } from "@/components/ui/badge";
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
import { Label } from "@/components/ui/label";

import { MASKED_PASSWORD, REVEAL_AUTO_HIDE_MS, getApiErrorMessage } from "./constants";
import type { KeyRevealResponse, KeysDetailResponse, ManagerKeyResponse } from "./constants";

interface ManagerKeyCardProps {
  projectId: string;
  managerKey: ManagerKeyResponse;
  /** 录入/修改成功后（响应返回最新 detail）就地更新 */
  onDetail: (next: KeysDetailResponse) => void;
}

/**
 * 管理密码卡：状态 chip + 掩码行（查看明文 5s 后自动回掩码）+ 录入/修改 Dialog。
 * 说明文案按原型 mnote 风格：「管理密码不分享给经纪人，查看明文将被记录」。
 */
export function ManagerKeyCard({ projectId, managerKey, onDetail }: ManagerKeyCardProps) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 卸载时清理明文自动回掩码定时器，避免卸载后 setState
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  /** 查看明文（reveal 留痕），5s 后自动回到掩码态 */
  const handleReveal = async () => {
    setRevealing(true);
    try {
      const { data, error } = await client.POST(
        "/api/v1/projects/{project_id}/keys/manager/reveal",
        { params: { path: { project_id: projectId } } },
      );
      if (error || !data) {
        toast.error(getApiErrorMessage(error, "查看明文失败"));
        return;
      }
      setRevealed(extractApiData<KeyRevealResponse>(data).password);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setRevealed(null), REVEAL_AUTO_HIDE_MS);
    } catch {
      toast.error("查看明文失败，请稍后重试");
    } finally {
      setRevealing(false);
    }
  };

  const handleSubmit = async () => {
    const trimmed = password.trim();
    if (!trimmed) {
      toast.error("请输入管理密码");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await client.PUT("/api/v1/projects/{project_id}/keys/manager", {
        params: { path: { project_id: projectId } },
        body: { password: trimmed },
      });
      if (error || !data) {
        toast.error(getApiErrorMessage(error, "保存管理密码失败"));
        return;
      }
      onDetail(extractApiData<KeysDetailResponse>(data));
      toast.success(managerKey.set ? "管理密码已修改" : "管理密码已录入");
      setDialogOpen(false);
    } catch {
      toast.error("保存管理密码失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="rounded-cards bg-pure-white p-6 shadow-steep">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-[500] text-ink">管理密码</h3>
        <Badge variant={managerKey.set ? "secondary" : "outline"}>
          {managerKey.set ? "已设置" : "未设置"}
        </Badge>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <span className="font-mono text-sm font-[450] tracking-wide text-ink">
          {revealed ?? MASKED_PASSWORD}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 px-2"
          onClick={handleReveal}
          disabled={!managerKey.set || revealing}
        >
          {revealing && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          查看明文
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => {
            setPassword("");
            setDialogOpen(true);
          }}
        >
          {managerKey.set ? "修改" : "录入管理密码"}
        </Button>
      </div>

      {managerKey.set && managerKey.updated_at && (
        <p className="mt-2 text-xs font-[430] text-graphite">
          最近更新 {safeFormatDate(managerKey.updated_at, "yyyy.MM.dd")}
        </p>
      )}

      {/* 原型 mnote：弱化说明文案 */}
      <div className="mt-4 rounded-[14px] bg-fog px-4 py-3 text-[13px] font-[430] leading-[1.55] text-graphite">
        管理密码不分享给经纪人，查看明文将被记录
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="rounded-cards sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{managerKey.set ? "修改管理密码" : "录入管理密码"}</DialogTitle>
            <DialogDescription>管理密码用于门锁管理，不分享给经纪人。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="manager-key-password">管理密码</Label>
            <Input
              id="manager-key-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入新密码"
              autoComplete="new-password"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button type="button" onClick={handleSubmit} disabled={submitting || !password.trim()}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
