import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { components } from "@/lib/api-types";

type TodoBoardSummary = components["schemas"]["TodoBoardSummary"];

interface TodoBoardSummaryCardProps {
  summary: TodoBoardSummary;
}

/**
 * 工作台「项目待办」统计条：复用待办看板 summary 全量口径（服务端计算），
 * 4 项指标视觉与看板页头工具栏一致（P0 阻塞 Rust 强调，最深逾期 null 显「—」），
 * 「去处理」直达 /admin/projects/todo-board。
 */
export function TodoBoardSummaryCard({ summary }: TodoBoardSummaryCardProps) {
  const maxOverdue = summary.max_overdue_days;

  return (
    <div
      className="col-span-12 rounded-[18px] bg-pure-white shadow-steep px-[18px] py-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 min-w-0"
      role="region"
      aria-label="项目待办"
    >
      {/* 移动端 2×2 网格防挤压折行，≥sm 恢复单行带分隔线（与看板页头一致） */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:flex sm:items-center min-w-0">
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

      <Link
        href="/admin/projects/todo-board"
        className="inline-flex items-center gap-1 text-sm font-[450] text-ink hover:text-rust transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded"
      >
        去处理
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Link>
    </div>
  );
}
