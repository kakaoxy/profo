"use client";

/**
 * 工作台「项目全流程」时间轴卡（设计稿 01/02 屏，span 12）。
 *
 * 结构：卡头 → 工具条（图例即筛选 / 视图 / 缩放）→ 横向滚动时间轴 → 页脚。
 * 几何与交互口径见 `docs/Done/2026-10-31-工作台项目全流程roadmap-widget-SPEC.md`；
 * 左列宽用 CSS 变量 `--rm-left`（<xl 160px，≥xl 208px），几何计算只用像素值，
 * 因此 JS 不重复维护断点。
 *
 * 单文件行数说明（AGENTS §1「单文件 >500 行必须拆分」的特例）：工具条、页脚与
 * 时间轴共享 filter / view / zoom / counts / 缩放中心保持等状态，拆出子组件需要
 * 8+ 个 prop 双层透传，追踪成本高于收益；本卡是单次使用的封闭视图，故按规则
 * 允许的「特殊需求注释说明」保留单文件。
 */

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  BASE_PPD,
  LEFT_COL_CLASS,
  STAGE_LABEL,
  STAGE_ORDER,
  ZOOM_MAX,
  STAGE_DASH_CLASS,
  STAGE_DOT_CLASS,
  ZOOM_MIN,
  daysBetween,
  formatDot,
  isDrawable,
  roadmapAxis,
  roadmapDomain,
  rowAriaLabel,
  segmentsOf,
  sortRoadmapProjects,
  stageOf,
  statusText,
  type RoadmapProject,
  type RoadmapSegment,
  type RoadmapStage,
} from "../../_lib/project-roadmap";
import { ProjectRoadmapTooltip } from "./project-roadmap-tooltip";
import { WidgetHead } from "./widget-head";

/** 「最新 10」视图条数（设计稿 ②） */
const RECENT_LIMIT = 10;
/** 键盘方向键单次平移像素（设计稿 ⑤） */
const PAN_STEP = 80;

const STAGE_BAR_CLASS: Record<RoadmapStage, string> = {
  sign: "bg-sky-wash",
  handover: "bg-apricot-wash",
  listing: "bg-ink",
  sold: "bg-rust",
};

/** 实心条内描边：浅色条需要 1px 边框才不糊在白色卡面上 */
const STAGE_INSET: Record<RoadmapStage, string> = {
  sign: "inset 0 0 0 1px rgba(23,25,28,.06)",
  handover: "inset 0 0 0 1px rgba(93,42,26,.08)",
  listing: "none",
  sold: "none",
};

interface ProjectRoadmapCardProps {
  projects: RoadmapProject[];
  /** 接口 total（用于「仅加载最近 200 个」提示） */
  total: number;
  /** 取数失败：只降级本卡 */
  failed: boolean;
  /** 服务端注入的今天（YYYY-MM-DD），避免 hydration 日期漂移 */
  today: string;
}

interface TipState {
  project: RoadmapProject;
  x: number;
  y: number;
}

export function ProjectRoadmapCard({ projects, total, failed, today }: ProjectRoadmapCardProps) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement>(null);
  const cornerRef = useRef<HTMLDivElement>(null);

  const [view, setView] = useState<"recent" | "all">("recent");
  const [filter, setFilter] = useState<RoadmapStage | null>(null);
  const [zoom, setZoom] = useState(1);
  const [tip, setTip] = useState<TipState | null>(null);

  const drawable = useMemo(() => sortRoadmapProjects(projects.filter(isDrawable)), [projects]);
  // 「缺日期」只统计没有签约日期的项目：`ended` 项目按 SPEC D6 静默排除，
  // 不能并入缺日期提示（否则页脚会多报「已下架」项目数，实测 14 vs 实际 13）
  const missingDates = useMemo(() => projects.filter((p) => !p.signingDate).length, [projects]);
  const base = useMemo(
    () => (view === "recent" ? drawable.slice(0, RECENT_LIMIT) : drawable),
    [drawable, view],
  );
  const counts = useMemo(() => {
    const map: Record<RoadmapStage, number> = { sign: 0, handover: 0, listing: 0, sold: 0 };
    for (const p of base) map[stageOf(p, today)] += 1;
    return map;
  }, [base, today]);
  const rows = useMemo(
    () => (filter ? base.filter((p) => stageOf(p, today) === filter) : base),
    [base, filter, today],
  );

  const domain = useMemo(() => roadmapDomain(base, today), [base, today]);
  const ppd = BASE_PPD * zoom;
  const axis = useMemo(() => roadmapAxis(domain, ppd), [domain, ppd]);
  const plotW = Math.round(daysBetween(domain.start, domain.end) * ppd) + 24;
  const xOf = useCallback(
    (date: string) => daysBetween(domain.start, date) * ppd,
    [domain.start, ppd],
  );

  /** 视口内可见的绘图宽度（扣除 sticky 左列） */
  const viewportWidth = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return 0;
    const left = cornerRef.current?.offsetWidth ?? 208;
    return Math.max(120, el.clientWidth - left);
  }, []);

  // 视图切换：时间轴右端是最新（今天），溢出时滚到最新
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    el.scrollLeft = maxScroll > 0 ? el.scrollWidth : 0;
  }, [view]);

  // 缩放：保持视口中心日期不漂移
  const prevPpd = useRef(ppd);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const prev = prevPpd.current;
    if (!el || prev === ppd) return;
    const viewport = viewportWidth();
    const centerDays = (el.scrollLeft + viewport / 2) / prev;
    el.scrollLeft = Math.max(0, centerDays * ppd - viewport / 2);
    prevPpd.current = ppd;
  }, [ppd, viewportWidth]);

  const clampZoom = (value: number) =>
    Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(value * 100) / 100));

  const fitZoom = () => {
    const totalDays = Math.max(1, daysBetween(domain.start, domain.end));
    // plotW 固定多出 24px 右侧留白，扣掉它（+8px 余量）才能「适应」后不出横向滚动条
    const avail = Math.max(160, viewportWidth() - 32);
    setZoom(clampZoom(avail / totalDays / BASE_PPD));
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollLeft = 0;
    });
  };

  const openProject = (id: string) => router.push(`/admin/projects/${id}`);

  const showTip = (project: RoadmapProject, x: number, y: number) => setTip({ project, x, y });

  const renderSegment = (segment: RoadmapSegment) => {
    const start = xOf(segment.start);
    const solidEnd = segment.end < today ? segment.end : today;
    const solidW =
      daysBetween(segment.start, solidEnd) > 0 ? Math.max(2, xOf(solidEnd) - start - 2) : 0;
    const hasFuture = segment.end > today;
    const live = hasFuture || segment.end >= today;
    const futureLeft = xOf(segment.start > today ? segment.start : today) + 2;
    const futureW = Math.max(2, xOf(segment.end) - futureLeft - 2);
    const shadow = live
      ? `${STAGE_INSET[segment.stage]}, inset -2px 0 0 rgba(255,255,255,.55)`
      : STAGE_INSET[segment.stage];

    return (
      <span key={`${segment.stage}-${segment.start}`}>
        {solidW > 0 ? (
          <span
            className={cn("absolute rounded-[5px]", STAGE_BAR_CLASS[segment.stage])}
            style={{ left: start, width: solidW, top: 13, height: 14, boxShadow: shadow }}
          />
        ) : null}
        {hasFuture ? (
          <span
            className={cn(
              "absolute rounded-[5px] border border-dashed",
              STAGE_DASH_CLASS[segment.stage],
            )}
            style={{ left: futureLeft, width: futureW, top: 12, height: 16 }}
          />
        ) : null}
      </span>
    );
  };

  const toolbar = (
    <div className="mt-3 mb-2 flex flex-wrap items-center gap-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        {STAGE_ORDER.map((stage) => {
          const active = filter === stage;
          return (
            <button
              key={stage}
              type="button"
              data-roadmap-chip={stage}
              aria-pressed={active}
              title={`只看当前处于「${STAGE_LABEL[stage].full}」的项目`}
              onClick={() => setFilter(active ? null : stage)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-[5px] text-xs transition-colors",
                active ? "bg-white font-[480] text-ink shadow-steep-sm" : "bg-fog text-ash hover:text-ink",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "h-2.5 w-2.5",
                  STAGE_DOT_CLASS[stage],
                  stage === "sold" ? "rounded-full" : "rounded-[3px]",
                )}
              />
              {STAGE_LABEL[stage].short}
              <span className="text-dove tabular-nums">{counts[stage]}</span>
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-full bg-fog p-[3px]">
          {(
            [
              ["recent", `最新 ${RECENT_LIMIT}`],
              ["all", `全部 ${drawable.length}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              data-roadmap-view={key}
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className={cn(
                "rounded-full px-[11px] py-[5px] text-xs transition-colors",
                view === key ? "bg-white font-[480] text-ink shadow-steep-sm" : "text-graphite hover:text-ink",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="inline-flex items-center gap-1.5 rounded-full bg-fog px-1.5 py-[3px]">
          <button
            type="button"
            aria-label="缩小时间轴"
            onClick={() => setZoom((z) => clampZoom(z - 0.1))}
            className="flex h-[25px] w-[25px] items-center justify-center rounded-full text-graphite transition-colors hover:bg-white hover:text-ink"
          >
            <Minus className="h-3 w-3" aria-hidden="true" />
          </button>
          <input
            type="range"
            data-roadmap-zoom=""
            aria-label={`时间轴缩放 ${Math.round(zoom * 100)}%`}
            min={35}
            max={300}
            step={5}
            value={Math.round(zoom * 100)}
            onChange={(e) => setZoom(clampZoom(Number(e.target.value) / 100))}
            className="h-1 w-[68px] cursor-pointer accent-ink"
          />
          <button
            type="button"
            aria-label="放大时间轴"
            onClick={() => setZoom((z) => clampZoom(z + 0.1))}
            className="flex h-[25px] w-[25px] items-center justify-center rounded-full text-graphite transition-colors hover:bg-white hover:text-ink"
          >
            <Plus className="h-3 w-3" aria-hidden="true" />
          </button>
          <span
            data-roadmap-zoom-label=""
            className="min-w-[32px] text-center text-[11px] text-graphite tabular-nums"
          >
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            data-roadmap-fit=""
            onClick={fitZoom}
            className="h-[25px] rounded-full px-2 text-[11px] text-graphite transition-colors hover:bg-white hover:text-ink"
          >
            适应
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="flex min-w-0 flex-1 flex-col rounded-cards bg-white px-[22px] py-5 shadow-steep-sm [--rm-left:160px] xl:[--rm-left:208px]"
      role="region"
      aria-label="项目全流程"
    >
      <WidgetHead
        title="项目全流程"
        badge="新增"
        sub="签约 → 交房 → 上架 → 成交"
        count={`${drawable.length} 个项目`}
        link="项目列表"
        href="/admin/projects"
      />

      {failed ? (
        <div
          data-roadmap-error=""
          className="mt-3 flex items-center gap-3 rounded-[14px] bg-apricot-wash px-3.5 py-3"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-rust">
            <TriangleAlert className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-[480] text-rust">项目列表加载失败</span>
            <span className="block text-[11.5px] text-rust/80">
              时间轴暂时不可用，其他卡片不受影响
            </span>
          </span>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="shrink-0 rounded-full bg-white px-3 py-1 text-[11.5px] font-[480] text-rust"
          >
            重试
          </button>
        </div>
      ) : drawable.length === 0 ? (
        <div data-roadmap-empty="" className="flex flex-col items-center px-4 pb-[34px] pt-[38px] text-center">
          <span className="flex h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-fog text-dove">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
              <path d="M4 6h16M4 12h10M4 18h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
          <p className="mt-3 text-[13px] font-[480] text-ink">暂无项目</p>
          <p className="mt-1 text-[11.5px] text-graphite">
            新建项目后，签约、交房、上架、成交会依次出现在这里
          </p>
          <Link
            href="/admin/projects"
            className="mt-3 text-[12px] font-[450] text-ink underline decoration-dove/50 underline-offset-4 hover:text-rust"
          >
            新建项目
          </Link>
        </div>
      ) : (
        <>
          {toolbar}

          <div
            ref={scrollRef}
            data-roadmap-chart=""
            role="region"
            tabIndex={0}
            aria-label={`项目生命周期时间轴，共 ${rows.length} 个项目；可横向滚动，方向键平移`}
            onScroll={() => setTip(null)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const el = scrollRef.current;
                if (el) el.scrollLeft += e.key === "ArrowRight" ? PAN_STEP : -PAN_STEP;
              }
            }}
            className="relative max-h-[508px] overflow-auto rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink/20"
          >
            {rows.length === 0 ? (
              <div
                data-roadmap-filtered-empty=""
                className="flex flex-col items-center px-4 pb-[34px] pt-[38px] text-center"
              >
                <span className="flex h-[52px] w-[52px] items-center justify-center rounded-[16px] bg-fog text-dove">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
                    <path d="M4 6h16M4 12h10M4 18h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </span>
                <p className="mt-3 text-[13px] font-[480] text-ink">该阶段暂无项目</p>
                <p className="mt-1 text-[11.5px] text-graphite">
                  当前视图下没有「{filter ? STAGE_LABEL[filter].full : ""}」阶段的项目
                </p>
                <button
                  type="button"
                  onClick={() => setFilter(null)}
                  className="mt-3 text-[12px] font-[450] text-ink underline decoration-dove/50 underline-offset-4 hover:text-rust"
                >
                  清除筛选
                </button>
              </div>
            ) : (
              <div
                className="relative"
                style={{ width: `calc(var(--rm-left) + ${plotW}px)` }}
              >
                {/* 轴：sticky top，左角 sticky left */}
                <div className="sticky top-0 z-[6] flex h-[46px] bg-white">
                  <div
                    ref={cornerRef}
                    className={cn(
                      "sticky left-0 z-[7] flex shrink-0 flex-col justify-center gap-0.5 bg-white pl-1",
                      LEFT_COL_CLASS,
                    )}
                  >
                    <span className="text-[11px] font-[480] text-ash">项目 / 当前阶段</span>
                    {/* 设计稿 `.rm-corner` 只给 MM.DD（`fmtDot(TODAY).slice(5)`），年份由轴上年份刻度承载 */}
                    <span className="text-[10.5px] text-graphite">
                      今天 {formatDot(today).slice(5)}
                    </span>
                  </div>
                  <div className="relative flex-1">
                    {axis.years.map((year) => (
                      <span
                        key={`y-${year.t}`}
                        className="absolute top-[5px] whitespace-nowrap text-[11px] font-[480] text-ash"
                        style={{ left: year.t * ppd + 4 }}
                      >
                        {year.label}
                      </span>
                    ))}
                    {axis.months
                      .filter((month) => month.show)
                      .map((month) => (
                        <span
                          key={`m-${month.t}`}
                          className="absolute bottom-[7px] -translate-x-1/2 whitespace-nowrap text-[10.5px] text-dove"
                          style={{ left: month.t * ppd }}
                        >
                          {month.label}
                        </span>
                      ))}
                    <span
                      aria-hidden="true"
                      className="absolute bottom-0 h-[5px] w-[3px] rounded-t-[2px] bg-rust"
                      style={{ left: xOf(today) - 1.5 }}
                    />
                  </div>
                </div>

                <div className="relative">
                  {/* 网格线与今天线：单层覆盖，避免逐行渲染 */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 z-0"
                    style={{ left: "var(--rm-left)", width: plotW }}
                  >
                    {axis.months
                      .filter((month) => month.show)
                      .map((month) => (
                        <span
                          key={`g-${month.t}`}
                          className={cn(
                            "absolute inset-y-0 w-px",
                            month.label === "1月" ? "bg-dove/[0.28]" : "bg-dove/[0.14]",
                          )}
                          style={{ left: month.t * ppd }}
                        />
                      ))}
                    <span
                      className="absolute inset-y-0 border-l-[1.5px] border-dashed border-rust/40"
                      style={{ left: xOf(today) }}
                    />
                  </div>

                  {rows.map((project) => {
                    const stage = stageOf(project, today);
                    const segments = segmentsOf(project, today);
                    return (
                      <div
                        key={project.id}
                        role="button"
                        tabIndex={0}
                        data-roadmap-row={project.id}
                        aria-label={rowAriaLabel(project, today)}
                        onClick={() => openProject(project.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openProject(project.id);
                          }
                        }}
                        onMouseEnter={(e) => showTip(project, e.clientX, e.clientY)}
                        onMouseMove={(e) => showTip(project, e.clientX, e.clientY)}
                        onMouseLeave={() => setTip(null)}
                        onFocus={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          showTip(project, rect.left + 240, rect.top + 18);
                        }}
                        onBlur={() => setTip(null)}
                        className="group relative z-[1] flex h-10 cursor-pointer items-center transition-colors hover:bg-fog focus-visible:bg-fog focus-visible:outline-none"
                      >
                        <div
                          className={cn(
                            "sticky left-0 z-[3] flex shrink-0 items-center gap-2 self-stretch bg-white pl-1 pr-2 group-hover:bg-fog group-focus-visible:bg-fog",
                            LEFT_COL_CLASS,
                          )}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-1.5">
                              <span className="truncate text-[13px] font-[480] text-ink">
                                {project.name}
                              </span>
                              {/* 真实 building_no 是完整地址，常已被项目名包含（如
                                  「金杨十街坊 - 金杨路660弄21号」+「金杨路660弄21号」），
                                  重复时隐藏，避免 208px 左列里两段互相挤断（hifi ⑤ 的
                                  短楼栋号在真实数据里不存在） */}
                              {project.buildingNo && !project.name.includes(project.buildingNo) ? (
                                <span className="max-w-[45%] shrink-0 truncate text-[10.5px] text-graphite">
                                  {project.buildingNo}
                                </span>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-graphite">
                              <span
                                aria-hidden="true"
                                className={cn(
                                  "h-[5px] w-[5px] shrink-0 rounded-full",
                                  STAGE_DOT_CLASS[stage],
                                )}
                              />
                              <span className="truncate">{statusText(project, today)}</span>
                            </div>
                          </div>
                        </div>

                        <div className="relative h-10 flex-1">
                          {segments.map((segment) => renderSegment(segment))}
                          {project.soldDate ? (
                            <span
                              aria-hidden="true"
                              className="absolute h-2.5 w-2.5 rounded-full bg-rust shadow-[0_0_0_2px_#fff,0_0_0_3px_rgba(93,42,26,0.13)] transition-shadow group-hover:shadow-[0_0_0_2px_#fff,0_0_0_4px_rgba(93,42,26,0.2)]"
                              style={{ left: xOf(project.soldDate) - 5, top: 15 }}
                            />
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-t border-dove/[0.16] pt-2.5 text-[11.5px] text-graphite">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>
                共 {drawable.length} 个项目 · 当前显示 {rows.length}
                {filter ? `（筛选：${STAGE_LABEL[filter].full}）` : ""}
              </span>
              {rows.length > RECENT_LIMIT ? (
                <span className="text-dove">· 列表可上下滚动</span>
              ) : null}
              {missingDates > 0 ? (
                <span className="text-dove">· {missingDates} 个项目缺日期未展示</span>
              ) : null}
              {total > projects.length ? (
                <span className="text-dove">· 仅加载最近 {projects.length} 个项目</span>
              ) : null}
            </span>
            <span className="flex flex-wrap items-center gap-3.5">
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-0 w-3.5 border-t border-dashed border-graphite" />
                今天之后为计划
              </span>
              <span className="flex items-center gap-1.5">
                <span aria-hidden="true" className="h-2 w-2 rounded-full bg-rust" />
                成交（瞬时节点）
              </span>
              <span className="hidden text-dove sm:inline">方向键平移 · 行可 Enter 进入</span>
            </span>
          </div>
        </>
      )}

      {tip ? (
        <ProjectRoadmapTooltip project={tip.project} today={today} x={tip.x} y={tip.y} />
      ) : null}
    </div>
  );
}
