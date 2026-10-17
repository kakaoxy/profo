"use client";

/**
 * 导入客户端（FR-08 / 设计稿 ARTBOARD 03）.
 *
 * 四步 stepper（可点击回看已完成步骤）：上传 → 检查数据 → 后台导入 → 核对结果；
 * 上传 zip/txt → 任务进度轮询（对账三计数实时）→ 失败明细下载；
 * 任务历史（状态/进度/对账/失败明细 URL）。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { client } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface ImportTask {
  id: string;
  status: string;
  filename: string;
  progress_percent: number;
  total_communities: number;
  total_buildings: number;
  total_rooms: number;
  warnings_count: number;
  processed_communities: number;
  communities_loaded: number;
  buildings_loaded: number;
  rooms_loaded: number;
  failed_file_url: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "待处理",
  processing: "执行中",
  completed: "已完成",
  failed: "失败",
  cancelled: "已取消",
};

/** 后端「已有导入进行中」互斥提示原文（承载力报告 M5 修复）；比对用于区分性错误提示 */
const CONFLICT_MESSAGE = "已有导入任务进行中，请等待完成后再上传";

/** 任务状态 → stepper 当前步（1 上传 2 检查 3 导入 4 核对） */
function stepOf(t: ImportTask | null): number {
  if (!t) return 1;
  if (t.status === "completed") return 4;
  if (t.status === "failed" || t.status === "cancelled") return 2;
  return 3;
}

/**
 * 重复包幂等重跑判定：已完成且确实处理了小区，但三类计数全为 0，
 * 说明包内数据已全部存在（upsert / ON CONFLICT 全部跳过），非导入异常。
 */
function isIdempotentRerun(t: ImportTask | null): boolean {
  if (!t) return false;
  return (
    t.status === "completed" && t.processed_communities > 0 && t.communities_loaded + t.buildings_loaded + t.rooms_loaded === 0
  );
}

/** 网关/接口层上限（与后端口径对齐）：nginx client_max_body_size 100M */
const MAX_UPLOAD_MB = 100;

const STEPS = [
  { n: 1, t: "上传文件", d: `楼盘字典 zip 包或单个 txt（≤${MAX_UPLOAD_MB}MB）` },
  { n: 2, t: "检查数据", d: "解析统计与问题行清单" },
  { n: 3, t: "后台导入", d: "后台慢慢导，关掉页面也不停" },
  { n: 4, t: "核对结果", d: "核对三类数量，失败的能下载" },
] as const;

export function ImportClient() {
  const [uploading, setUploading] = useState(false);
  const [tasks, setTasks] = useState<ImportTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadTasks = useCallback(async () => {
    const { data } = await client.GET("/api/v1/admin/building-dictionary/import/tasks", {
      params: { query: { page: 1, page_size: 20 } },
    });
    if (data) {
      // 生成类型收敛：failed_file_url / error_message / completed_at 为 Optional
      const items: ImportTask[] = data.items.map((t) => ({
        ...t,
        failed_file_url: t.failed_file_url ?? null,
        error_message: t.error_message ?? null,
        completed_at: t.completed_at ?? null,
      }));
      setTasks(items);
      setActiveTaskId((prev) => {
        if (prev && items.some((t) => t.id === prev)) return prev;
        return items[0]?.id ?? null;
      });
    }
  }, []);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  const activeTask = tasks.find((t) => t.id === activeTaskId) ?? null;
  const currentStep = stepOf(activeTask);

  /** 执行中任务轮询（NFR-01：可关闭页面，进度由异步任务承担） */
  useEffect(() => {
    if (activeTask && (activeTask.status === "processing" || activeTask.status === "pending")) {
      pollRef.current = setInterval(() => void loadTasks(), 3000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
  }, [activeTask, loadTasks]);

  const handleUpload = useCallback(
    async (file: File) => {
      // M6 修复（承载力报告 L2-③）：前端预检。不满足条件的文件直接拒绝，
      // 避免运营误选超大文件走完整上传后才被后端/网关拒绝
      if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
        toast.error(`文件超过 ${MAX_UPLOAD_MB}MB 上限（网关限制），请按批次拆分后分批导入`);
        return;
      }
      setUploading(true);
      try {
        const { error } = await client.POST("/api/v1/admin/building-dictionary/import", {
          // @ts-expect-error openapi-fetch multipart 通过 body 传 FormData
          body: { file } as FormData,
          bodySerializer: (bd: Record<string, unknown>) => {
            const fd = new FormData();
            for (const [k, v] of Object.entries(bd)) {
              fd.append(k, v as Blob | string);
            }
            return fd;
          },
        });
        if (error) {
          const msg = (error as { message?: string } | null)?.message;
          if (msg === CONFLICT_MESSAGE) {
            // 后端已明确建任务被拒（互斥 409）：直接透传后端提示
            toast.error(msg);
            return;
          }
          toast.error("上传失败：仅支持 zip/txt；网关单包 ≤100MB，解压总量 ≤1GB");
          return;
        }
        toast.success("导入任务已创建并启动");
        await loadTasks();
      } finally {
        setUploading(false);
      }
    },
    [loadTasks],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-[280px_1fr] items-start gap-7">
        {/* 左侧 stepper（已完成步骤可点击回看） */}
        <div className="flex flex-col">
          {STEPS.map((s, idx) => {
            const done = s.n < currentStep;
            const now = s.n === currentStep;
            return (
              <div key={s.n} className="relative flex gap-3 pb-6 last:pb-0">
                {idx < STEPS.length - 1 ? (
                  <span className="absolute left-[13px] top-7 bottom-1 w-0.5 rounded bg-dove/30" />
                ) : null}
                <span
                  className={cn(
                    "z-10 flex size-7 shrink-0 items-center justify-center rounded-full border-2 font-mono text-[11px] font-semibold",
                    done && "bg-ink border-ink text-white",
                    now && "border-rust bg-white text-rust",
                    !done && !now && "border-dove/50 bg-fog text-graphite",
                  )}
                >
                  {done ? <Check className="size-3.5" /> : s.n}
                </span>
                <span className="pt-1">
                  <span className={cn("block text-[13px] font-medium", done || now ? "text-ink" : "text-graphite")}>
                    {s.t}
                  </span>
                  <span className="mt-0.5 block text-[11px] text-dove">{s.d}</span>
                </span>
              </div>
            );
          })}
        </div>

        {/* 右侧步骤内容 */}
        <div>
          {/* 步骤 1/2：上传（解析由后端任务承担，完成后即对账） */}
          {currentStep <= 2 ? (
            <div className="flex flex-col gap-3">
              <section
                className={cn(
                  "flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-dove/60 py-12",
                  uploading && "pointer-events-none opacity-60",
                )}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (uploading) return; // M6：上传中禁止重复提交
                  const f = e.dataTransfer.files[0];
                  if (f) void handleUpload(f);
                }}
              >
                <FileUp className="size-8 text-dove" />
                <p className="mt-3 text-[15px] text-ink">
                  拖文件到这里，或{" "}
                  <button
                    type="button"
                    className="font-medium text-rust underline"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                  >
                    点击选择
                  </button>
                  （单个 ≤ {MAX_UPLOAD_MB} MB）
                </p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".zip,.txt"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUpload(f);
                    e.target.value = "";
                  }}
                />
                <Button className="mt-3 bg-ink text-white" disabled={uploading} onClick={() => fileRef.current?.click()}>
                  {uploading ? <Loader2 className="mr-1 size-4 animate-spin" /> : null}
                  {uploading ? "上传中…" : `选择文件上传（≤${MAX_UPLOAD_MB}MB）`}
                </Button>
                <p className="mt-2 text-[12px] text-graphite">GBK/UTF-8 自动识别 · 逐小区事务 · 失败行 csv 留档 90 天</p>
              </section>
              {tasks.length === 0 && !uploading ? (
                <p className="text-[12px] leading-relaxed text-graphite">
                  样例：点击上方虚线框即完成上传 → 自动解析检查数据。
                </p>
              ) : null}
            </div>
          ) : null}

          {/* 步骤 3：后台导入进度（对账三计数实时推进） */}
          {activeTask && currentStep === 3 ? (
            <section className="rounded-2xl border border-dove/40 p-5">
              <p className="text-[15px] font-medium text-ink">
                导入任务 <span className="ml-1 font-mono text-[11px] font-normal text-graphite">#{activeTask.id.slice(0, 8)}</span>
              </p>
              <div className="mt-3 grid grid-cols-4 gap-2">
                <StatBox value={`${Math.round(activeTask.progress_percent)}%`} label="总进度" />
                <StatBox value={activeTask.communities_loaded.toLocaleString()} label="小区已导入" />
                <StatBox value={`${(activeTask.rooms_loaded / 10000).toFixed(1)}万`} label="户室已导入" />
                <StatBox
                  value={activeTask.error_message ? "!" : "0"}
                  label="失败文件"
                  accent={!!activeTask.error_message}
                />
              </div>
              <Progress value={activeTask.progress_percent} className="mt-4 h-2" />
              <p className="mt-3 text-[12px] leading-relaxed text-graphite">
                后台导入中，关掉页面也不停；完成后自动进入核对。
              </p>
            </section>
          ) : null}

          {/* 步骤 4：核对结果 */}
          {activeTask && currentStep === 4 ? (
            <section className="rounded-2xl border border-dove/40 p-5">
              <p className="text-[15px] font-medium text-ink">核对结果</p>
              <div className="mt-3 grid grid-cols-4 gap-2">
                <StatBox
                  value={activeTask.communities_loaded.toLocaleString()}
                  label={activeTask.total_communities && activeTask.communities_loaded === activeTask.total_communities ? "小区数量对上了" : "小区入库"}
                  accent={!!activeTask.total_communities && activeTask.communities_loaded !== activeTask.total_communities}
                />
                <StatBox
                  value={activeTask.buildings_loaded.toLocaleString()}
                  label="楼栋入库"
                  accent={!!activeTask.total_buildings && activeTask.buildings_loaded !== activeTask.total_buildings}
                />
                <StatBox
                  value={activeTask.rooms_loaded.toLocaleString()}
                  label="户室入库"
                  accent={!!activeTask.total_rooms && activeTask.rooms_loaded !== activeTask.total_rooms}
                />
                <StatBox value={activeTask.warnings_count.toLocaleString()} label="问题跳过" accent={activeTask.warnings_count > 0} />
              </div>
              {activeTask.error_message ? (
                <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{activeTask.error_message}</p>
              ) : isIdempotentRerun(activeTask) ? (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[13px] text-amber-700">
                  检测到重复导入：包内 {activeTask.processed_communities.toLocaleString()} 个小区已全部存在，本次无新增数据（同包重跑不会重复入库），小区库无需更新。
                </p>
              ) : (
                <p className="mt-3 text-[12px] leading-relaxed text-graphite">
                  数量全部对上，可以开始用了；失败明细和原文件保留 90 天。
                </p>
              )}
              {activeTask.failed_file_url ? (
                <a
                  href={activeTask.failed_file_url}
                  className="mt-2 inline-block text-[13px] text-rust underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  下载失败明细 csv
                </a>
              ) : null}
              <div className="mt-3 flex justify-end">
                <Button size="sm" className="bg-ink text-white" onClick={() => setActiveTaskId(null)}>
                  去小区库
                </Button>
              </div>
            </section>
          ) : null}

          {/* 失败态 */}
          {activeTask && activeTask.status === "failed" ? (
            <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
              <p className="text-[15px] font-medium text-rose-800">导入失败</p>
              <p className="mt-2 text-[13px] text-rose-700">{activeTask.error_message || "请检查文件格式后重试"}</p>
            </section>
          ) : null}
        </div>
      </div>

      {/* 任务历史（对齐 PropertyImportTask 模式） */}
      <section>
        <h3 className="mb-2 text-[15px] font-medium text-ink">导入任务历史</h3>
        <div className="overflow-hidden rounded-2xl border border-dove/40">
          <table className="w-full text-[13px]">
            <thead className="bg-fog text-left text-graphite">
              <tr>
                <th className="px-4 py-2">任务 ID</th>
                <th className="px-4 py-2">文件</th>
                <th className="px-4 py-2">创建时间</th>
                <th className="px-4 py-2">状态</th>
                <th className="px-4 py-2">进度</th>
                <th className="px-4 py-2 text-right">小区</th>
                <th className="px-4 py-2 text-right">户室</th>
                <th className="px-4 py-2">失败清单</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dove/20">
              {tasks.map((t) => (
                <tr
                  key={t.id}
                  className={cn("cursor-pointer hover:bg-fog/60", t.id === activeTaskId && "bg-apricot-wash/40")}
                  onClick={() => setActiveTaskId(t.id)}
                >
                  <td className="px-4 py-2 font-mono text-[12px]">{t.id.slice(0, 8)}</td>
                  <td className="px-4 py-2">{t.filename}</td>
                  <td className="px-4 py-2 tabular-nums">{new Date(t.created_at).toLocaleString("zh-CN")}</td>
                  <td className="px-4 py-2">
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[10.5px]",
                        t.status === "completed" && "bg-sky-wash text-[#2c4a76]",
                        (t.status === "processing" || t.status === "pending") && "bg-apricot-wash text-rust",
                        t.status === "failed" && "bg-rose-100 text-rose-700",
                        (t.status === "cancelled" || t.status === "unknown") && "bg-fog text-graphite",
                      )}
                    >
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                    {isIdempotentRerun(t) ? <span className="ml-2 text-[10.5px] text-graphite">重复包，无新增</span> : null}
                  </td>
                  <td className="px-4 py-2 tabular-nums">
                    <span className="mr-2 inline-block h-1.5 w-20 overflow-hidden rounded-full bg-fog align-middle">
                      <span
                        className="block h-full rounded-full bg-rust"
                        style={{ width: `${Math.round(t.progress_percent)}%` }}
                      />
                    </span>
                    {Math.round(t.progress_percent)}%
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{t.communities_loaded.toLocaleString()}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{t.rooms_loaded.toLocaleString()}</td>
                  <td className="px-4 py-2">
                    {t.failed_file_url ? (
                      <a
                        href={t.failed_file_url}
                        className="text-rust underline"
                        target="_blank"
                        rel="noreferrer"
                        onClick={(e) => e.stopPropagation()}
                      >
                        failed csv
                      </a>
                    ) : (
                      <span className="text-graphite">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-graphite">
                    暂无导入任务
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatBox({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-fog px-3 py-2.5">
      <p className={cn("font-display text-[19px] tabular-nums", accent ? "text-rust" : "text-ink")}>{value}</p>
      <p className="mt-0.5 text-[10px] text-graphite">{label}</p>
    </div>
  );
}
