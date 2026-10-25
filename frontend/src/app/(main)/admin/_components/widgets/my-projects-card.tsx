import type { components } from "@/lib/api-types";
import { WidgetHead } from "./widget-head";

type ProjectResponse = components["schemas"]["ProjectResponse"];

interface MyProjectsCardProps {
  projects: ProjectResponse[];
}

/** 项目状态 → 中文名 */
const STATUS_LABELS: Record<string, string> = {
  signing: "签约",
  renovating: "装修中",
  selling: "在售",
  sold: "已成交",
  ended: "已下架",
};

/**
 * 工作台「我负责的项目」卡（span 12，仅 user 角色）。
 *
 * 数据源：`GET /api/v1/projects/my-responsible`（仅需登录态，按业务身份收敛：
 * 装修对接负责人 或 销售团队三字段）。普通员工即使无 `project:read` 也能看到。
 */
export function MyProjectsCard({ projects }: MyProjectsCardProps) {
  return (
    <div
      className="flex min-w-0 flex-1 flex-col rounded-cards bg-white px-[22px] py-5 shadow-steep-sm"
      role="region"
      aria-label="我负责的项目"
    >
      <WidgetHead
        title="我负责的项目"
        sub={`${projects.length} 个`}
        link="全部"
        href="/admin/projects"
      />

      <ul className="mt-2">
        {projects.map((project) => {
          const net = project.net_cash_flow;
          const netValue = net == null ? null : Number(net);
          return (
            <li
              key={project.id}
              className="flex items-center justify-between gap-3 border-b border-dove/18 py-[11px] last:border-b-0"
            >
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-[450] text-ink">
                  {project.community_name ?? project.name ?? "未命名项目"}
                </span>
                <span className="block truncate text-[11.5px] text-graphite">
                  {STATUS_LABELS[project.status] ?? project.status}
                  {project.list_price != null && ` · 挂牌 ${project.list_price} 万`}
                </span>
              </span>
              <span
                className={`shrink-0 text-[13.5px] font-[450] tabular-nums ${
                  netValue == null || netValue === 0
                    ? "text-graphite"
                    : netValue > 0
                      ? "text-money-positive"
                      : "text-money-negative"
                }`}
              >
                {netValue == null
                  ? "—"
                  : `${netValue > 0 ? "+" : ""}${(netValue / 10000).toFixed(1)}`}
              </span>
            </li>
          );
        })}
        {projects.length === 0 && (
          <li className="py-6 text-center text-xs text-dove">
            暂无负责的项目
            <span className="mt-1 block">被指派为装修对接人或销售团队成员后会出现在这里</span>
          </li>
        )}
      </ul>
    </div>
  );
}
