import { cn } from "@/lib/utils";
import type { components } from "@/lib/api-types";
import { WidgetHead } from "./widget-head";
import { WgKpi } from "./wg-kpi";

type TodoBoard = components["schemas"]["ProjectTodoBoardResponse"];

interface TodoBoardSummaryCardProps {
  board: TodoBoard | null;
}

/** 首条待办行：按看板顺序取第一个项目的第一个事项 */
function firstTodo(board: TodoBoard | null) {
  if (!board) return null;
  for (const project of board.projects) {
    const todo = project.todos[0];
    if (todo) return { projectName: project.community_name, todo };
  }
  return null;
}

/**
 * 工作台「项目待办」卡（span 3，设计稿屏 01 第 4 卡）：
 * WGHead「看板」链接 + 2×2 KPI（待办项目/待办总数/P0 阻塞/最深逾期）+ 首条待办行。
 *
 * 指标口径按 SPEC D-05（原「逾期/今日/本周」结构性恒 0，改为可算四项）；
 * 数据源 `GET /projects/todo-board`（全量口径，服务端计算）。
 */
export function TodoBoardSummaryCard({ board }: TodoBoardSummaryCardProps) {
  const summary = board?.summary;
  const maxOverdue = summary?.max_overdue_days ?? null;
  const first = firstTodo(board);

  return (
    <div
      className="flex min-w-0 flex-1 flex-col rounded-cards bg-white px-[22px] py-5 shadow-steep-sm"
      role="region"
      aria-label="项目待办"
    >
      <WidgetHead title="项目待办" link="看板" href="/admin/projects/todo-board" />

      <div className="mt-[18px] grid grid-cols-2 gap-x-3.5 gap-y-4">
        <WgKpi label="待办项目" value={summary?.project_count ?? "—"} />
        <WgKpi label="待办总数" value={summary?.todo_count ?? "—"} />
        <WgKpi label="P0 阻塞" value={summary?.p0_count ?? "—"} valueClassName="text-rust" />
        <WgKpi
          label="最深逾期"
          value={maxOverdue ?? "—"}
          unit={maxOverdue != null ? "天" : undefined}
        />
      </div>

      {first && (
        <div className="mt-2 flex min-w-0 items-start gap-2.5 border-t border-dove/18 pt-2.5">
          <span className="min-w-0 truncate pt-0.5 text-[13.5px] font-[450] text-ink">
            {first.projectName} · {first.todo.title}
          </span>
          {first.todo.days_label && (
            <span
              className={cn(
                "ml-auto shrink-0 pt-0.5 text-[11.5px] tabular-nums",
                first.todo.days_hot ? "font-[450] text-rust" : "text-graphite",
              )}
            >
              {first.todo.days_label}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
