"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import useSWR from "swr";
import { Search, Check, ChevronDown, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { fetchSubjects, type SubjectItem } from "@/app/(main)/admin/ledger/subject-actions";
import { LayerPill } from "@/app/(main)/admin/ledger/[projectId]/_components/layer-pill";
import { LEVEL_LABELS, type SubjectLevel } from "@/app/(main)/admin/ledger/subjects/_components/subject-schema";

interface SubjectSelectPanelProps {
  value: string;
  onChange: (subjectId: string) => void;
  businessForm?: "agent" | "wholesale" | null;
  error?: string;
}

export function SubjectSelectPanel({
  value,
  onChange,
  businessForm,
  error,
}: SubjectSelectPanelProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // businessForm: "agent" | "wholesale" | null -> 后端 mode: "agent" | "acquire" | undefined
  // wholesale 对应后端 acquire 模式
  const mode =
    businessForm === "agent"
      ? "agent"
      : businessForm === "wholesale"
        ? "acquire"
        : undefined;

  const { data: subjects, isLoading } = useSWR(
    mode ? `subjects-${mode}` : "subjects-all",
    async () => {
      const res = await fetchSubjects(mode);
      if (res.success) return res.data;
      throw new Error(res.message || "加载科目列表失败");
    },
  );

  // 搜索过滤（科目名称 + 备注 模糊匹配）
  const filtered = useMemo(() => {
    if (!subjects) return [];
    const q = query.trim().toLowerCase();
    if (!q) return subjects;
    return subjects.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.note ?? "").toLowerCase().includes(q),
    );
  }, [subjects, query]);

  // 按 level 分组（保持 1-7 顺序）
  const grouped = useMemo(() => {
    const map = new Map<SubjectLevel, SubjectItem[]>();
    for (const s of filtered) {
      if (!map.has(s.level)) map.set(s.level, []);
      map.get(s.level)!.push(s);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  const selectedSubject = subjects?.find((s) => s.id === value);

  // 点击外部关闭面板
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() =>
          setOpen((o) => {
            if (!o) setQuery("");
            return !o;
          })
        }
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-lg border bg-card px-3 py-2 text-left transition-[border-color,box-shadow] duration-200",
          open ? "border-ink ring-1 ring-ink/20" : "border-border hover:border-dove",
          error && !open && "border-destructive",
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          {selectedSubject ? (
            <>
              <LayerPill level={selectedSubject.level} />
              <span className="font-medium text-sm text-ink truncate">
                {selectedSubject.name}
              </span>
            </>
          ) : (
            <span className="text-sm text-dove">请选择科目...</span>
          )}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-dove shrink-0 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          ref={panelRef}
          className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-card shadow-lg max-h-[320px] overflow-auto"
        >
          {/* 搜索框 */}
          <div className="sticky top-0 bg-card border-b border-border p-2 z-10">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-dove pointer-events-none" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="搜索科目名称..."
                className="h-8 pl-8 text-sm"
              />
            </div>
          </div>

          {/* 科目列表（按 level 分组） */}
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-dove">
              <Loader2 className="h-4 w-4 animate-spin" />
              加载中...
            </div>
          ) : grouped.length === 0 ? (
            <div className="py-6 text-center text-sm text-dove">无匹配科目</div>
          ) : (
            grouped.map(([level, items]) => (
              <div key={level}>
                <div className="sticky top-[44px] bg-fog/80 backdrop-blur px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-graphite z-[5]">
                  {LEVEL_LABELS[level] ?? `L${level}`}
                </div>
                {items.map((s) => {
                  const isSelected = s.id === value;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => {
                        onChange(s.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left transition-[background-color] duration-150 border-b border-border/50",
                        isSelected ? "bg-apricot-wash/40" : "hover:bg-fog",
                      )}
                    >
                      <LayerPill level={s.level} />
                      <span className="flex-1 text-sm font-medium text-ink truncate">
                        {s.name}
                      </span>
                      <span
                        className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded shrink-0",
                          s.pnl
                            ? "bg-success-container text-success"
                            : "bg-fog text-dove",
                        )}
                      >
                        {s.pnl ? "进损益" : "不进损益"}
                      </span>
                      {isSelected && <Check className="h-3.5 w-3.5 text-ink shrink-0" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}

      {error && <span className="mt-1 block text-[11px] text-destructive">{error}</span>}
      {selectedSubject?.note && !open && (
        <span className="mt-1 block text-[11px] text-dove">{selectedSubject.note}</span>
      )}
    </div>
  );
}

export default SubjectSelectPanel;
