"use client";

import { useMemo, useState } from "react";
import { useQueryStates, parseAsString } from "nuqs";
import { CheckCircle } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/common/empty-state";
import type { TodoBoardResponse, TodoItemData, TodoProjectCardData } from "../_lib/todo-board-config";
import { TodoProjectCard } from "./todo-project-card";
import { TodoDetailSheet } from "./todo-detail-popup";

type ActiveTodo = { card: TodoProjectCardData; item: TodoItemData };

interface TodoBoardViewProps {
  data: TodoBoardResponse;
}

/** Steep 阶段 Tab（设计稿 .tab：fog 容器 + Ink 激活，.n 计数胶囊随激活换色） */
const STAGE_TAB_TRIGGER =
  "rounded-full px-3.5 py-1.5 text-[13px] font-[450] text-ink data-[state=active]:bg-ink data-[state=active]:text-white data-[state=active]:[&_.n]:bg-white/16 data-[state=active]:[&_.n]:text-white/85";

function StageTabCount({ value }: { value: number }) {
  return (
    <span className="n rounded-full bg-[#eef0f3] px-[7px] py-[1.5px] font-mono text-[11px] text-graphite tabular-nums">
      {value}
    </span>
  );
}

const SELECT_TRIGGER_CLASS =
  "h-9 rounded-full border-none bg-pure-white px-3.5 shadow-steep-sm text-[12.5px] font-[450] text-ink";

/**
 * 看板视图：单行工具栏（4 指标全量口径 + 阶段 Tabs + 优先级/负责人 Select）
 * + 3 列卡片网格（后端已排序，筛选为纯客户端过滤）。
 * 筛选状态经 nuqs URL 同步（shallow: false，可分享/回退）；
 * 明细弹窗状态收口于此（同屏仅一个）：桌面 Popover / 移动 Sheet。
 */
export function TodoBoardView({ data }: TodoBoardViewProps) {
  const [{ stage, priority, manager }, setQuery] = useQueryStates(
    {
      stage: parseAsString.withDefault("all"),
      priority: parseAsString.withDefault("all"),
      manager: parseAsString.withDefault("all"),
    },
    { shallow: false },
  );
  const [activeTodo, setActiveTodo] = useState<ActiveTodo | null>(null);

  const projects = data.projects;

  // 负责人选项从全量数据派生（Map 去重，保持出现顺序）
  const managerOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projects) {
      if (p.manager) map.set(p.manager.id, p.manager.name ?? p.manager.id);
    }
    return [...map.entries()];
  }, [projects]);

  const filtered = useMemo(
    () =>
      projects.filter((p) => {
        if (stage !== "all" && p.status !== stage) return false;
        if (priority === "p0" && p.p0_count === 0) return false;
        if (priority === "calm" && p.p0_count > 0) return false;
        if (manager !== "all" && p.manager?.id !== manager) return false;
        return true;
      }),
    [projects, stage, priority, manager],
  );

  // Tab 计数为全量口径（不随筛选变化）
  const stageCounts = useMemo(
    () => ({
      all: projects.length,
      signing: projects.filter((p) => p.status === "signing").length,
      renovating: projects.filter((p) => p.status === "renovating").length,
    }),
    [projects],
  );

  const summary = data.summary;
  const maxOverdue = summary.max_overdue_days;

  return (
    <div className="flex flex-col gap-4">
      {/* 单行工具栏：统计 + 筛选 */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-[18px] bg-pure-white px-[18px] py-2.5 shadow-steep">
        {/* 移动端 2×2 网格防挤压折行，≥sm 恢复单行带分隔线 */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:flex sm:items-center">
          <div className="flex items-baseline gap-2 whitespace-nowrap sm:mr-5 sm:border-r sm:border-[#f0f0f2] sm:py-0.5 sm:pr-5">
            <span className="text-xs font-[430] text-graphite">待办项目</span>
            <span className="text-[21px] font-[480] tracking-[-0.02em] tabular-nums text-ink">
              {summary.project_count}
            </span>
          </div>
          <div className="flex items-baseline gap-2 whitespace-nowrap sm:mr-5 sm:border-r sm:border-[#f0f0f2] sm:py-0.5 sm:pr-5">
            <span className="text-xs font-[430] text-rust opacity-75">P0 阻塞</span>
            <span className="text-[21px] font-[480] tracking-[-0.02em] tabular-nums text-rust">
              {summary.p0_count}
            </span>
          </div>
          <div className="flex items-baseline gap-2 whitespace-nowrap sm:mr-5 sm:border-r sm:border-[#f0f0f2] sm:py-0.5 sm:pr-5">
            <span className="text-xs font-[430] text-graphite">待办总数</span>
            <span className="text-[21px] font-[480] tracking-[-0.02em] tabular-nums text-ink">
              {summary.todo_count}
            </span>
          </div>
          <div className="flex items-baseline gap-2 whitespace-nowrap sm:py-0.5">
            <span className="text-xs font-[430] text-graphite">最深逾期</span>
            <span className="text-[21px] font-[480] tracking-[-0.02em] tabular-nums text-ink">
              {maxOverdue ?? "—"}
              {maxOverdue != null && (
                <small className="ml-0.5 text-xs font-[450] tracking-normal text-graphite">天</small>
              )}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={stage} onValueChange={(v) => setQuery({ stage: v })}>
            <TabsList className="h-auto rounded-full bg-fog p-[3px]">
              <TabsTrigger value="all" className={STAGE_TAB_TRIGGER}>
                全部 <StageTabCount value={stageCounts.all} />
              </TabsTrigger>
              <TabsTrigger value="signing" className={STAGE_TAB_TRIGGER}>
                签约 <StageTabCount value={stageCounts.signing} />
              </TabsTrigger>
              <TabsTrigger value="renovating" className={STAGE_TAB_TRIGGER}>
                装修 <StageTabCount value={stageCounts.renovating} />
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <Select value={priority} onValueChange={(v) => setQuery({ priority: v })}>
            <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-[124px]`}>
              <SelectValue placeholder="优先级" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部优先级</SelectItem>
              <SelectItem value="p0">仅含 P0</SelectItem>
              <SelectItem value="calm">无 P0</SelectItem>
            </SelectContent>
          </Select>

          <Select value={manager} onValueChange={(v) => setQuery({ manager: v })}>
            <SelectTrigger className={`${SELECT_TRIGGER_CLASS} w-[136px]`}>
              <SelectValue placeholder="负责人" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部负责人</SelectItem>
              {managerOptions.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* 卡片网格（1/2/3 列） */}
      {projects.length === 0 ? (
        <div className="rounded-cards bg-pure-white shadow-steep">
          <EmptyState
            icon={<CheckCircle className="h-12 w-12" />}
            title="全部事项已推进完毕"
            description="当前没有待处理的签约或装修阶段项目。"
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-cards bg-pure-white py-[34px] text-center text-[13px] text-graphite shadow-steep">
          当前筛选下没有待办项目 — 换个条件试试
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((card) => (
            <TodoProjectCard
              key={card.project_id}
              card={card}
              openKey={activeTodo ? `${activeTodo.card.project_id}:${activeTodo.item.rule_code}` : null}
              onOpenTodo={(c, item) => setActiveTodo({ card: c, item })}
              onClearTodo={() => setActiveTodo(null)}
            />
          ))}
        </div>
      )}

      {/* 移动端明细弹窗（桌面由卡片内 Popover 承担） */}
      <TodoDetailSheet active={activeTodo} onClose={() => setActiveTodo(null)} />
    </div>
  );
}
