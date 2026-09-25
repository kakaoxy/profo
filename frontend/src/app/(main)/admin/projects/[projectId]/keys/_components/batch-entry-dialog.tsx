"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { client } from "@/lib/api-client";
import { extractApiData } from "@/lib/api-helpers";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import {
  GENERATE_COUNT_OPTIONS,
  MASKED_PASSWORD,
  MAX_BATCH_ENTRY,
  getApiErrorMessage,
} from "./constants";
import type {
  GeneratedNormalKeyItem,
  KeysDetailResponse,
  NormalKeyGenerateResponse,
} from "./constants";

interface BatchEntryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** 录入/生成/换一批成功后（响应返回最新 detail）就地更新父级 */
  onDetail: (next: KeysDetailResponse) => void;
}

/** 本地日期 → yyyy-MM-dd（避免 toISOString 的 UTC 偏移导致差一天） */
function todayLocal(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/**
 * 批量录入 Dialog（双 Tab，默认随机生成——业务流程=生成后在门锁逐组录入）：
 * - 随机生成：组数 chip（5/6/8/10）→ generate 落库为「待录入」并返回明文（生成即揭示）；
 *   逐组「标记已录入」（confirm 后隐藏明文）；换一批（regenerate 整批替换待录入组）
 * - 手动录入：多行密码（最多 20 组）+ 可选生效日期（默认今天）→ 即录即生效
 */
export function BatchEntryDialog({
  open,
  onOpenChange,
  projectId,
  onDetail,
}: BatchEntryDialogProps) {
  // 随机生成（默认 Tab）
  const [count, setCount] = useState<number>(GENERATE_COUNT_OPTIONS[0]);
  const [generatedKeys, setGeneratedKeys] = useState<GeneratedNormalKeyItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // 手动录入
  const [passwords, setPasswords] = useState<string[]>([""]);
  const [effectiveDate, setEffectiveDate] = useState("");
  const [manualSubmitting, setManualSubmitting] = useState(false);

  // 每次打开重置，不带入上次的输入与生成结果
  useEffect(() => {
    if (open) {
      setPasswords([""]);
      setEffectiveDate(todayLocal());
      setGeneratedKeys([]);
      setCount(GENERATE_COUNT_OPTIONS[0]);
    }
  }, [open]);

  const updatePassword = (index: number, value: string) => {
    setPasswords((prev) => prev.map((pwd, i) => (i === index ? value : pwd)));
  };

  const addPasswordRow = () => {
    setPasswords((prev) => (prev.length >= MAX_BATCH_ENTRY ? prev : [...prev, ""]));
  };

  const removePasswordRow = (index: number) => {
    setPasswords((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  /** 手动录入：即录即生效（effective_date 缺省时后端默认今日） */
  const handleManualSubmit = async () => {
    const trimmed = passwords.map((pwd) => pwd.trim()).filter(Boolean);
    if (trimmed.length === 0) {
      toast.error("请至少输入一组密码");
      return;
    }
    setManualSubmitting(true);
    try {
      const { data, error } = await client.POST("/api/v1/projects/{project_id}/keys/normal/batch", {
        params: { path: { project_id: projectId } },
        body: { passwords: trimmed, effective_date: effectiveDate || null },
      });
      if (error || !data) {
        toast.error(getApiErrorMessage(error, "批量录入失败"));
        return;
      }
      onDetail(extractApiData<KeysDetailResponse>(data));
      toast.success(`已录入 ${trimmed.length} 组密码`);
      onOpenChange(false);
    } catch {
      toast.error("批量录入失败，请稍后重试");
    } finally {
      setManualSubmitting(false);
    }
  };

  /** 生成/换一批共用：响应含本次生成的待录入组（明文）+ 最新 detail */
  const applyGenerateResponse = (res: NormalKeyGenerateResponse) => {
    onDetail(res.detail);
    setGeneratedKeys(res.keys);
  };

  /** 随机生成：生成即落库「待录入」，响应直接携带明文（生成即揭示） */
  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await client.POST(
        "/api/v1/projects/{project_id}/keys/normal/generate",
        {
          params: { path: { project_id: projectId } },
          body: { count },
        },
      );
      if (error || !data) {
        toast.error(getApiErrorMessage(error, "生成失败"));
        return;
      }
      applyGenerateResponse(extractApiData<NormalKeyGenerateResponse>(data));
      toast.success("已生成，请在门锁上逐组录入后标记");
    } catch {
      toast.error("生成失败，请稍后重试");
    } finally {
      setGenerating(false);
    }
  };

  /** 换一批：整批替换未标记（待录入）组，count 缺省=与被替换组数一致 */
  const handleRegenerate = async () => {
    setGenerating(true);
    try {
      const { data, error } = await client.POST(
        "/api/v1/projects/{project_id}/keys/normal/regenerate",
        {
          params: { path: { project_id: projectId } },
          body: {},
        },
      );
      if (error || !data) {
        toast.error(getApiErrorMessage(error, "换一批失败"));
        return;
      }
      applyGenerateResponse(extractApiData<NormalKeyGenerateResponse>(data));
      toast.success("已换一批");
    } catch {
      toast.error("换一批失败，请稍后重试");
    } finally {
      setGenerating(false);
    }
  };

  /** 标记已录入：confirm 后该行密码隐藏（掩码），状态转「有效」 */
  const handleConfirm = async (key: GeneratedNormalKeyItem) => {
    setConfirmingId(key.id);
    try {
      const { data, error } = await client.POST(
        "/api/v1/projects/{project_id}/keys/normal/{key_id}/confirm",
        { params: { path: { project_id: projectId, key_id: key.id } } },
      );
      if (error || !data) {
        toast.error(getApiErrorMessage(error, "标记失败"));
        return;
      }
      onDetail(extractApiData<KeysDetailResponse>(data));
      setGeneratedKeys((prev) =>
        prev.map((row) =>
          row.id === key.id ? { ...row, status: "active", password: MASKED_PASSWORD } : row,
        ),
      );
      toast.success(`第 ${key.seq} 组已标记为已录入`);
    } catch {
      toast.error("标记失败，请稍后重试");
    } finally {
      setConfirmingId(null);
    }
  };

  const pendingCount = generatedKeys.filter((key) => key.status === "pending_entry").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-cards sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>批量录入普通密码</DialogTitle>
          <DialogDescription>
            随机生成的密码为待录入状态，生成后请按序号在门锁上逐组录入；手动录入的密码即录即生效。
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="random">
          <TabsList>
            <TabsTrigger value="random">随机生成</TabsTrigger>
            <TabsTrigger value="manual">手动录入</TabsTrigger>
          </TabsList>

          {/* Tab 1：随机生成（默认） */}
          <TabsContent value="random" className="mt-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-[430] text-graphite">生成组数</span>
              {GENERATE_COUNT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setCount(option)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[13px] font-[450] transition-colors",
                    count === option
                      ? "border-rust bg-rust text-pure-white"
                      : "border-[#e2e2e5] text-ink hover:border-dove",
                  )}
                >
                  {option} 组
                </button>
              ))}
            </div>

            {generatedKeys.length === 0 ? (
              <Button
                type="button"
                className="w-fit"
                onClick={handleGenerate}
                disabled={generating}
              >
                {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                生成
              </Button>
            ) : (
              <div className="flex flex-col gap-2">
                {generatedKeys.map((key) => {
                  const isPending = key.status === "pending_entry";
                  return (
                    <div
                      key={key.id}
                      className="flex items-center justify-between rounded-[12px] border border-[#efeff1] px-3 py-2"
                    >
                      <span className="font-mono text-sm text-ink">
                        #{key.seq} · {isPending ? key.password : MASKED_PASSWORD}
                      </span>
                      {isPending ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2"
                          onClick={() => handleConfirm(key)}
                          disabled={confirmingId === key.id}
                        >
                          {confirmingId === key.id && (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          )}
                          标记已录入
                        </Button>
                      ) : (
                        <span className="text-sm text-graphite">已录入</span>
                      )}
                    </div>
                  );
                })}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-[430] text-graphite">
                    生成后为待录入状态，锁上录入后请标记为已录入
                  </p>
                  {pendingCount > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleRegenerate}
                      disabled={generating}
                    >
                      {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      换一批
                    </Button>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Tab 2：手动录入 */}
          <TabsContent value="manual" className="mt-4 flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              {passwords.map((pwd, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    value={pwd}
                    onChange={(event) => updatePassword(index, event.target.value)}
                    placeholder={`第 ${index + 1} 组密码`}
                    autoComplete="off"
                  />
                  {passwords.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0"
                      onClick={() => removePasswordRow(index)}
                      aria-label="移除该组"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={addPasswordRow}
              disabled={passwords.length >= MAX_BATCH_ENTRY}
            >
              <Plus className="mr-1 h-4 w-4" />
              再添加一组
            </Button>
            <div className="grid gap-2">
              <Label htmlFor="normal-key-effective-date">生效日期（非必填，默认今天）</Label>
              <Input
                id="normal-key-effective-date"
                type="date"
                value={effectiveDate}
                onChange={(event) => setEffectiveDate(event.target.value)}
              />
            </div>
            <div className="flex justify-end">
              <Button type="button" onClick={handleManualSubmit} disabled={manualSubmitting}>
                {manualSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                确认录入
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
