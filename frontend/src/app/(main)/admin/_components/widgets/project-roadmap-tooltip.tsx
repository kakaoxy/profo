"use client";

/**
 * 「项目全流程」时间轴浮层（设计稿 .rm-tip）。
 *
 * 位置固定于视口：宽度 304px、高度按设计稿常量 198px 参与翻转计算，
 * 贴近视口下沿时翻到行上方，再夹紧到 `[12, innerHeight - H - 12]`。
 */

import { Fragment } from "react";
import {
  formatDot,
  formatWan,
  STAGE_LABEL,
  STAGE_DOT_CLASS,
  tooltipRows,
  type RoadmapProject,
} from "../../_lib/project-roadmap";

const TIP_WIDTH = 304;
const TIP_HEIGHT = 198;

interface ProjectRoadmapTooltipProps {
  project: RoadmapProject;
  today: string;
  x: number;
  y: number;
}

export function ProjectRoadmapTooltip({ project, today, x, y }: ProjectRoadmapTooltipProps) {
  const rows = tooltipRows(project, today);
  const soldPrice = project.soldPrice;

  let left = x + 14;
  let top = y + 18;
  if (typeof window !== "undefined") {
    left = Math.min(window.innerWidth - TIP_WIDTH - 16, Math.max(12, left));
    if (top + TIP_HEIGHT > window.innerHeight - 12) top = y - TIP_HEIGHT - 14;
    top = Math.min(Math.max(12, top), Math.max(12, window.innerHeight - TIP_HEIGHT - 12));
  }

  return (
    <div
      role="tooltip"
      data-roadmap-tooltip=""
      className="pointer-events-none fixed z-[130] w-[304px] rounded-[18px] bg-white px-4 pb-[13px] pt-[14px] shadow-steep"
      style={{ left, top }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13.5px] font-medium text-ink">{project.name}</span>
        <span className="shrink-0 text-[11px] text-dove">{project.buildingNo ?? ""}</span>
      </div>
      <div className="mt-0.5 text-[11px] text-graphite">{project.managerName ?? "未指派"}</div>

      <div className="mt-2.5 grid grid-cols-[38px_1fr_46px] gap-x-2 gap-y-[7px] text-[11.5px]">
        {rows.map((row) => (
          <Fragment key={row.stage}>
            <span className="flex items-center gap-1.5 text-graphite">
              <span
                aria-hidden="true"
                className={`h-[7px] w-[7px] rounded-full ${STAGE_DOT_CLASS[row.stage]}`}
              />
              {STAGE_LABEL[row.stage].short}
            </span>
            <span className={`tabular-nums ${row.date ? "text-ink" : "text-dove"}`}>
              {formatDot(row.date)}
            </span>
            <span className="text-right text-dove tabular-nums">{row.gap}</span>
          </Fragment>
        ))}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-3 border-t border-dove/[0.16] pt-2 text-[11px] text-graphite">
        <span className="tabular-nums">签约价 {formatWan(project.signingPrice)}</span>
        <span className="tabular-nums">
          {soldPrice !== null ? "成交价" : "挂牌价"} {formatWan(soldPrice ?? project.listPrice)}
        </span>
      </div>
    </div>
  );
}
