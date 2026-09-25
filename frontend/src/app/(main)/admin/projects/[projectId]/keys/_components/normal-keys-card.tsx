"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";

import { client } from "@/lib/api-client";
import { extractApiData } from "@/lib/api-helpers";
import { safeFormatDate } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { BatchDeleteDialog } from "./batch-delete-dialog";
import { BatchEntryDialog } from "./batch-entry-dialog";
import {
  MASKED_PASSWORD,
  NORMAL_KEY_STATUS_META,
  REVEAL_AUTO_HIDE_MS,
  getApiErrorMessage,
} from "./constants";
import type { KeyRevealResponse, KeysDetailResponse, NormalKeyItem } from "./constants";

interface NormalKeysCardProps {
  projectId: string;
  normalKeys: NormalKeyItem[];
  /** 单组修改/停用/标记已录入、批量录入成功后（响应返回最新 detail）就地更新 */
  onDetail: (next: KeysDetailResponse) => void;
  /** 批量删除成功后重拉 detail（该接口不返回 detail） */
  onRefresh: () => Promise<void>;
}

/** 行内二次确认目标（停用 / 删除共用一个 AlertDialog） */
type ConfirmTarget = { kind: "disable" | "delete"; key: NormalKeyItem } | null;

const ACTION_BUTTON_CLASS = "h-8 px-2 text-[13px]";

/**
 * 普通密码卡：多选 Table + 行内操作 + 批量录入 / 批量删除入口。
 * 行操作按状态收敛：active=查看|修改|停用|删除；pending_entry=标记已录入|删除；disabled=仅查看。
 * 停用/删除走 AlertDialog 二次确认；单组删除复用批量删除接口（裸 id 数组）。
 */
export function NormalKeysCard({
  projectId,
  normalKeys,
  onDetail,
  onRefresh,
}: NormalKeysCardProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<{ id: string; password: string } | null>(null);
  const [revealingId, setRevealingId] = useState<string | null>(null);
  const [entryOpen, setEntryOpen] = useState(false);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [modifyKey, setModifyKey] = useState<NormalKeyItem | null>(null);
  const [modifyPassword, setModifyPassword] = useState("");
  const [modifySubmitting, setModifySubmitting] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<ConfirmTarget>(null);
  const [confirmSubmitting, setConfirmSubmitting] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // 选中集合只保留仍存在的行（删除/换一批后自动收缩）
  const selectedKeys = normalKeys.filter((key) => selectedIds.has(key.id));
  const allSelected = normalKeys.length > 0 && selectedKeys.length === normalKeys.length;
  const selectAllState = allSelected ? true : selectedKeys.length > 0 ? "indeterminate" : false;

  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(normalKeys.map((key) => key.id)));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  /** 查看明文（reveal 留痕），就地显示 5s 后自动回掩码 */
  const handleReveal = async (key: NormalKeyItem) => {
    setRevealingId(key.id);
    try {
      const { data, error } = await client.POST(
        "/api/v1/projects/{project_id}/keys/normal/{key_id}/reveal",
        { params: { path: { project_id: projectId, key_id: key.id } } },
      );
      if (error || !data) {
        toast.error(getApiErrorMessage(error, "查看明文失败"));
        return;
      }
      setRevealed({ id: key.id, password: extractApiData<KeyRevealResponse>(data).password });
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setRevealed(null), REVEAL_AUTO_HIDE_MS);
    } catch {
      toast.error("查看明文失败，请稍后重试");
    } finally {
      setRevealingId(null);
    }
  };

  /** 标记已录入（生效时间=标记日） */
  const handleConfirm = async (key: NormalKeyItem) => {
    try {
      const { data, error } = await client.POST(
        "/api/v1/projects/{project_id}/keys/normal/{key_id}/confirm",
        { params: { path: { project_id: projectId, key_id: key.id } } },
      );
      if (error || !data) {
        toast.error(getApiErrorMessage(error, "标记已录入失败"));
        return;
      }
      onDetail(extractApiData<KeysDetailResponse>(data));
      toast.success("已标记为已录入");
    } catch {
      toast.error("标记已录入失败，请稍后重试");
    }
  };

  /** 行内「修改」提交 */
  const handleModify = async () => {
    if (!modifyKey) return;
    const trimmed = modifyPassword.trim();
    if (!trimmed) {
      toast.error("请输入新密码");
      return;
    }
    setModifySubmitting(true);
    try {
      const { data, error } = await client.PATCH(
        "/api/v1/projects/{project_id}/keys/normal/{key_id}",
        {
          params: { path: { project_id: projectId, key_id: modifyKey.id } },
          body: { password: trimmed },
        },
      );
      if (error || !data) {
        toast.error(getApiErrorMessage(error, "修改密码失败"));
        return;
      }
      onDetail(extractApiData<KeysDetailResponse>(data));
      toast.success("密码已修改");
      setModifyKey(null);
    } catch {
      toast.error("修改密码失败，请稍后重试");
    } finally {
      setModifySubmitting(false);
    }
  };

  /** AlertDialog 确认回调：停用走 PATCH，删除复用批量删除接口（裸 id 数组） */
  const handleConfirmAction = async () => {
    if (!confirmTarget) return;
    const { kind, key } = confirmTarget;
    setConfirmSubmitting(true);
    try {
      const { data, error } =
        kind === "disable"
          ? await client.PATCH("/api/v1/projects/{project_id}/keys/normal/{key_id}", {
              params: { path: { project_id: projectId, key_id: key.id } },
              body: { status: "disabled" },
            })
          : await client.POST("/api/v1/projects/{project_id}/keys/normal/batch-delete", {
              params: { path: { project_id: projectId } },
              body: [key.id],
            });
      if (error || !data) {
        toast.error(getApiErrorMessage(error, kind === "disable" ? "停用失败" : "删除失败"));
        return;
      }
      if (kind === "disable") {
        onDetail(extractApiData<KeysDetailResponse>(data));
        toast.success("已停用");
      } else {
        toast.success("已删除");
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(key.id);
          return next;
        });
        await onRefresh();
      }
      setConfirmTarget(null);
    } catch {
      toast.error(kind === "disable" ? "停用失败，请稍后重试" : "删除失败，请稍后重试");
    } finally {
      setConfirmSubmitting(false);
    }
  };

  return (
    <section className="rounded-cards bg-pure-white p-6 shadow-steep">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-[500] text-ink">普通密码</h3>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8"
            disabled={selectedKeys.length === 0}
            onClick={() => setBatchDeleteOpen(true)}
          >
            批量删除{selectedKeys.length > 0 ? `（${selectedKeys.length}）` : ""}
          </Button>
          <Button type="button" size="sm" className="h-8" onClick={() => setEntryOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            批量录入
          </Button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={selectAllState}
                  onCheckedChange={toggleSelectAll}
                  aria-label="全选"
                />
              </TableHead>
              <TableHead>密码</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>生效时间</TableHead>
              <TableHead>操作人</TableHead>
              <TableHead>更新时间</TableHead>
              <TableHead>最后分享时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {normalKeys.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-sm text-graphite">
                  暂无普通密码，点击右上角「批量录入」添加
                </TableCell>
              </TableRow>
            ) : (
              normalKeys.map((key) => {
                const statusMeta = NORMAL_KEY_STATUS_META[key.status] ?? {
                  label: key.status,
                  variant: "outline" as const,
                };
                const isRevealed = revealed?.id === key.id;
                return (
                  <TableRow key={key.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(key.id)}
                        onCheckedChange={() => toggleSelect(key.id)}
                        aria-label="选择该组密码"
                      />
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          "font-mono text-sm tracking-wide",
                          isRevealed ? "text-ink" : "text-graphite",
                        )}
                      >
                        {isRevealed ? revealed.password : MASKED_PASSWORD}
                      </span>
                      <span className="ml-2 text-xs text-graphite">#{key.seq}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                        {key.share_active && (
                          <Badge variant="default" className="px-1.5 text-[10px]">
                            分享中
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-graphite">
                      {safeFormatDate(key.effective_date, "yyyy.MM.dd")}
                    </TableCell>
                    <TableCell className="text-sm text-graphite">
                      {key.created_by_name ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-graphite">
                      {safeFormatDate(key.updated_at, "yyyy.MM.dd")}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-graphite">
                      {key.last_shared_at
                        ? safeFormatDate(key.last_shared_at, "yyyy.MM.dd HH:mm")
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-0.5">
                        {(key.status === "active" || key.status === "disabled") && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={ACTION_BUTTON_CLASS}
                            onClick={() => handleReveal(key)}
                            disabled={revealingId === key.id}
                          >
                            {revealingId === key.id && (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            )}
                            查看
                          </Button>
                        )}
                        {key.status === "active" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={ACTION_BUTTON_CLASS}
                            onClick={() => {
                              setModifyPassword("");
                              setModifyKey(key);
                            }}
                          >
                            修改
                          </Button>
                        )}
                        {key.status === "pending_entry" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={ACTION_BUTTON_CLASS}
                            onClick={() => handleConfirm(key)}
                          >
                            标记已录入
                          </Button>
                        )}
                        {key.status === "active" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={ACTION_BUTTON_CLASS}
                            onClick={() => setConfirmTarget({ kind: "disable", key })}
                          >
                            停用
                          </Button>
                        )}
                        {key.status !== "disabled" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className={cn(
                              ACTION_BUTTON_CLASS,
                              "text-destructive hover:text-destructive",
                            )}
                            onClick={() => setConfirmTarget({ kind: "delete", key })}
                          >
                            删除
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* 批量录入（双 Tab：手动录入 / 随机生成） */}
      <BatchEntryDialog
        open={entryOpen}
        onOpenChange={setEntryOpen}
        projectId={projectId}
        onDetail={onDetail}
      />

      {/* 批量删除确认（含分享中警告） */}
      <BatchDeleteDialog
        open={batchDeleteOpen}
        onOpenChange={setBatchDeleteOpen}
        projectId={projectId}
        keys={selectedKeys}
        onDeleted={async () => {
          setSelectedIds(new Set());
          await onRefresh();
        }}
      />

      {/* 行内「修改」Dialog */}
      <Dialog open={!!modifyKey} onOpenChange={(open) => !open && setModifyKey(null)}>
        <DialogContent className="rounded-cards sm:max-w-md">
          <DialogHeader>
            <DialogTitle>修改密码</DialogTitle>
            <DialogDescription>修改后立即生效，操作将记录在日志中。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="normal-key-password">新密码</Label>
            <Input
              id="normal-key-password"
              value={modifyPassword}
              onChange={(event) => setModifyPassword(event.target.value)}
              placeholder="请输入新密码"
              autoComplete="new-password"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setModifyKey(null)}>
              取消
            </Button>
            <Button
              type="button"
              onClick={handleModify}
              disabled={modifySubmitting || !modifyPassword.trim()}
            >
              {modifySubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 停用 / 删除 二次确认（AlertDialog） */}
      <AlertDialog open={!!confirmTarget} onOpenChange={(open) => !open && setConfirmTarget(null)}>
        <AlertDialogContent className="rounded-cards">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTarget?.kind === "disable" ? "停用该组密码？" : "删除该组密码？"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget?.kind === "disable"
                ? "停用后该组密码不再可用，操作将记录在日志中。"
                : confirmTarget?.key.share_active
                  ? "该组密码仍在分享中，删除后经纪人端将显示“密码已失效”。删除后不可恢复。"
                  : "删除后不可恢复。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void handleConfirmAction();
              }}
              disabled={confirmSubmitting}
              className={
                confirmTarget?.kind === "delete"
                  ? "bg-destructive text-white hover:bg-destructive/90"
                  : undefined
              }
            >
              {confirmSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {confirmTarget?.kind === "disable" ? "确认停用" : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
