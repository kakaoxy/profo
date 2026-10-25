import type { components } from "@/lib/api-types";
import { WidgetHead } from "./widget-head";

type TodoBoard = components["schemas"]["ProjectTodoBoardResponse"];
type TodoProjectCard = components["schemas"]["TodoProjectCard"];
type TodoItemOut = components["schemas"]["TodoItemOut"];

interface MyTodosCardProps {
  board: TodoBoard | null;
}

interface FlatTodo {
  projectName: string;
  todo: TodoItemOut;
}

/**
 * 展平看板为「项目 · 事项」列表（取每个项目的前 2 条，最多 6 条）。
 *
 * ⚠️ 内容来自后端待办规则引擎（R1–R10：文书/工序/交房/委托期），
 * 与设计稿样例文案（客户复看/价格复核）不同 —— SPEC D-05 已登记为已知偏差。
 */
function flattenTodos(projects: TodoProjectCard[]): FlatTodo[] {
  const result: FlatTodo[] = [];
  for (const project of projects) {
    for (const todo of project.todos.slice(0, 2)) {
      result.push({ projectName: project.community_name, todo });
      if (result.length >= 6) return result;
    }
  }
  return result;
}

/**
 * 工作台「我的待办」卡（span 12，仅 user 角色）。
 *
 * 数据源：`GET /api/v1/projects/todo-board?scope=mine`（仅需登录态，
 * 按业务身份收敛，与 `/projects/my-responsible` 同一谓词）。
 */
export function MyTodosCard({ board }: MyTodosCardProps) {
  const items = board ? flattenTodos(board.projects) : [];
  const summary = board?.summary;

  return (
    <div
      className="flex min-w-0 flex-1 flex-col rounded-cards bg-white px-[22px] py-5 shadow-steep-sm"
      role="region"
      aria-label="我的待办"
    >
      <WidgetHead
        title="我的待办"
        sub={summary ? `${summary.todo_count} 条 · ${summary.project_count} 个项目` : undefined}
        link="待办看板"
        href="/admin/projects/todo-board"
      />

      <ul className="mt-2">
        {items.map((item, index) => (
          <li
            key={`${item.projectName}-${item.todo.rule_code}-${index}`}
            className="flex items-center justify-between gap-3 border-b border-dove/18 py-[11px] last:border-b-0"
          >
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-[450] text-ink">
                {item.projectName} · {item.todo.title}
              </span>
              {item.todo.hint && (
                <span className="block truncate text-[11.5px] text-graphite">{item.todo.hint}</span>
              )}
            </span>
            {item.todo.days_label && (
              <span
                className={`shrink-0 text-[12px] tabular-nums ${
                  item.todo.days_hot ? "text-rust" : "text-graphite"
                }`}
              >
                {item.todo.days_label}
              </span>
            )}
          </li>
        ))}
        {items.length === 0 && (
          <li className="py-6 text-center text-xs text-dove">
            暂无待办
            <span className="mt-1 block">签约和装修阶段的项目待办会出现在这里</span>
          </li>
        )}
      </ul>
    </div>
  );
}
