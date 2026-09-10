"use client";

import { useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { cn } from "@/lib/utils";
import {
  LEVEL_LABELS,
  LEVEL_PILL_CLASS,
  STAGE_META,
  type Subject,
  type SubjectMode,
  type SubjectStage,
} from "./subject-schema";
import { SubjectEditDialog } from "./subject-edit-dialog";
import { deleteSubject } from "../actions";

interface SubjectFlowchartProps {
  agentSubjects: Subject[];
  acquireSubjects: Subject[];
}

/**
 * 业务流阶段流程图（Steep）
 *
 * - 白卡 + rounded-cards + shadow-steep，无边框
 * - 顶部代理/收购模式切换：Apricot（代理）/ Sky Wash（收购），替换原紫色
 * - 阶段标记为单色描边图标（弃用 emoji），连接线为 Apricot → Rust 渐变
 */
export function SubjectFlowchart({ agentSubjects, acquireSubjects }: SubjectFlowchartProps) {
  const [modeView, setModeView] = useState<SubjectMode>("agent");
  const [editOpen, setEditOpen] = useState(false);
  const [editSubj, setEditSubj] = useState<Subject | null>(null);
  const [defaultStage, setDefaultStage] = useState<SubjectStage | undefined>();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<Subject | null>(null);

  const subjects = modeView === "agent" ? agentSubjects : acquireSubjects;
  const stages = STAGE_META[modeView];

  const stageSubjects = useMemo(() => {
    const map: Record<string, Subject[]> = {};
    subjects.forEach((s) => {
      if (!map[s.stage]) map[s.stage] = [];
      map[s.stage].push(s);
    });
    return map;
  }, [subjects]);

  const counts = useMemo(() => {
    const total = subjects.length;
    const custom = subjects.filter((s) => !s.system).length;
    return { total, custom };
  }, [subjects]);

  function openCreate(stage?: SubjectStage) {
    setEditSubj(null);
    setDefaultStage(stage);
    setEditOpen(true);
  }

  function openEdit(s: Subject) {
    setEditSubj(s);
    setDefaultStage(undefined);
    setEditOpen(true);
  }

  function handleDelete(s: Subject): void {
    if (s.system) {
      toast.error("系统预置科目不可删除");
      return;
    }
    setConfirmTarget(s);
  }

  async function confirmDelete(): Promise<void> {
    const s = confirmTarget;
    if (!s) return;
    setDeletingId(s.id);
    try {
      const res = await deleteSubject(s.id);
      if (res.success) {
        toast.success("已删除科目");
        setConfirmTarget(null);
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error("删除失败，请稍后重试");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-cards bg-white p-6 shadow-steep">
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <h2 className="text-[15px] font-medium text-ink">业务流阶段流程图</h2>
        <span className="rounded-full bg-apricot-wash px-2.5 py-0.5 text-xs font-medium text-rust">
          {counts.total} 个科目
        </span>
        {counts.custom > 0 && (
          <span className="rounded-full bg-apricot-wash px-2.5 py-0.5 text-xs font-medium text-rust">
            自定义 {counts.custom}
          </span>
        )}
        <div className="flex-1" />
        <div className="inline-flex rounded-full bg-fog p-1">
          <ModeButton
            active={modeView === "agent"}
            activeClass="bg-apricot-wash text-rust"
            dotClass="bg-rust"
            onClick={() => setModeView("agent")}
          >
            代理业务
          </ModeButton>
          <ModeButton
            active={modeView === "acquire"}
            activeClass="bg-sky-wash text-ink"
            dotClass="bg-ink"
            onClick={() => setModeView("acquire")}
          >
            收购业务
          </ModeButton>
        </div>
        <Button
          size="sm"
          className="h-9 rounded-full bg-rust px-4 text-pure-white hover:bg-rust/90"
          onClick={() => openCreate()}
        >
          <Plus className="mr-1 h-4 w-4" /> 新增科目
        </Button>
      </header>

      <div className="overflow-x-auto">
        <div className="relative min-w-[760px]">
          {/* 阶段连接线（置于阶段标记圆圈后） */}
          <div
            aria-hidden
            className="absolute top-[26px] right-[10%] left-[10%] h-0.5 bg-gradient-to-r from-apricot-wash via-rust/50 to-rust"
          />
          <div
            className="relative z-10 grid gap-0"
            style={{
              gridTemplateColumns: `repeat(${stages.length}, minmax(0, 1fr))`,
            }}
          >
            {stages.map((st) => {
              const StageIcon = st.icon;
              const list = (stageSubjects[st.key] ?? [])
                .slice()
                .sort((a, b) => a.level.localeCompare(b.level));
              return (
                <div key={st.key} className="px-2">
                  <div className="mx-auto mb-3 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-white text-rust shadow-steep-sm ring-4 ring-fog">
                    <StageIcon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <p className="text-center text-sm font-medium text-ink">{st.name}</p>
                  <p className="mb-3 text-center text-[11px] text-graphite">{st.sub}</p>
                  <div className="flex min-h-[140px] flex-col gap-1.5 rounded-[14px] border border-dove/40 bg-white p-2">
                    {list.length === 0 && (
                      <div className="py-5 text-center text-[11px] text-graphite italic">
                        无科目
                      </div>
                    )}
                    {list.map((s) => (
                      <SubjectRow
                        key={s.id}
                        subject={s}
                        deleting={deletingId === s.id}
                        onEdit={() => openEdit(s)}
                        onDelete={() => handleDelete(s)}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() => openCreate(st.key)}
                      className="mt-auto flex items-center justify-center gap-1 rounded-[10px] border border-dashed border-dove py-1.5 text-[11px] text-graphite transition-colors hover:border-rust hover:bg-apricot-wash/50 hover:text-rust"
                    >
                      <Plus className="h-3 w-3" /> 新增到本阶段
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <SubjectEditDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        subject={editSubj}
        defaultStage={defaultStage}
        defaultMode={modeView}
      />

      <AlertDialog
        open={!!confirmTarget}
        onOpenChange={(open) => {
          if (!open && deletingId === null) setConfirmTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除科目「{confirmTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              已关联流水的科目删除后流水将显示“科目已删除”。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingId !== null}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deletingId !== null}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingId !== null ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  删除中…
                </>
              ) : (
                "确认删除"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** 单个科目卡片 */
function SubjectRow({
  subject,
  deleting,
  onEdit,
  onDelete,
}: {
  subject: Subject;
  deleting: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-center justify-between gap-1.5 rounded-[10px] border border-dove/40 bg-white px-2 py-1.5 text-xs transition-all hover:-translate-y-px hover:border-rust hover:bg-apricot-wash/30">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <LevelPill level={subject.level} />
        <span className="flex items-center gap-1 font-medium text-ash">
          <span className="truncate">{subject.name}</span>
          {subject.system && (
            <span className="rounded bg-sky-wash/60 px-1 text-[9px] text-graphite">系统</span>
          )}
        </span>
        <span className="text-[10px] text-graphite">{subject.pnl ? "进损益" : "不进损益"}</span>
      </div>
      <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          title="编辑"
          className="flex h-5 w-5 items-center justify-center rounded text-graphite hover:bg-fog hover:text-rust"
        >
          <Pencil className="h-3 w-3" />
        </button>
        {!subject.system && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="删除"
            disabled={deleting}
            className="flex h-5 w-5 items-center justify-center rounded text-graphite hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
          >
            {deleting ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

/** 层级 pill */
function LevelPill({ level }: { level: Subject["level"] }) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap",
        LEVEL_PILL_CLASS[level],
      )}
    >
      {LEVEL_LABELS[level]}
    </span>
  );
}

/** 模式切换按钮 */
function ModeButton({
  active,
  activeClass,
  dotClass,
  onClick,
  children,
}: {
  active: boolean;
  activeClass: string;
  dotClass: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
        active ? activeClass : "text-graphite hover:text-ink",
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", dotClass)} />
      {children}
    </button>
  );
}
