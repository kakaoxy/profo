/**
 * 工作台「项目全流程」时间轴的纯模型（无 React、无副作用）。
 *
 * 数据源：`GET /api/v1/projects?page=1&page_size=200&signing_sort=true`
 * （见 `docs/To-Do/2026-10-31-工作台项目全流程roadmap-widget-SPEC.md` §3）。
 *
 * 日期一律按「日」计算：后端 `ProjectResponse` 的签约/交房/上架/成交日期是
 * `YYYY-MM-DD` 字符串，必须用 `Date.UTC` 解析；用 `new Date("2026-04-10")`
 * 会被当成 UTC 午夜，UTC+8 下整体偏移一天（SPEC §3.1）。
 */

import type { components } from "@/lib/api-types";

type ProjectResponse = components["schemas"]["ProjectResponse"];
export type RoadmapProjectStatus = components["schemas"]["ProjectStatus"];

export type RoadmapStage = "sign" | "handover" | "listing" | "sold";

/** 时间轴行（已从 ProjectResponse 归一化，日期缺失为 null） */
export interface RoadmapProject {
  id: string;
  name: string;
  buildingNo: string | null;
  status: RoadmapProjectStatus;
  signingDate: string | null;
  handoverDate: string | null;
  listingDate: string | null;
  soldDate: string | null;
  /** 万元 */
  signingPrice: number | null;
  listPrice: number | null;
  soldPrice: number | null;
  managerName: string | null;
  createdAt: string;
}

export interface RoadmapSegment {
  stage: RoadmapStage;
  start: string;
  end: string;
}

export interface RoadmapDomain {
  start: string;
  end: string;
}

export interface RoadmapMonthTick {
  /** 距域起点的天数（可为负，渲染时跳过） */
  t: number;
  label: string;
  show: boolean;
}

export interface RoadmapAxis {
  months: RoadmapMonthTick[];
  years: { t: number; label: string }[];
}

export interface RoadmapTipRow {
  stage: RoadmapStage;
  label: string;
  date: string | null;
  /** 到下一阶段的间隔天数文案（「—」表示无下一节点） */
  gap: string;
}

const DAY_MS = 86_400_000;

/** 设计稿 `BASE_PPD`：zoom = 1 时每天占 2.6px */
export const BASE_PPD = 2.6;
export const ZOOM_MIN = 0.35;
export const ZOOM_MAX = 3;

export const STAGE_ORDER = ["sign", "handover", "listing", "sold"] as const;

export const STAGE_LABEL: Record<RoadmapStage, { short: string; full: string }> = {
  sign: { short: "签约", full: "签约中" },
  handover: { short: "交房", full: "交房中" },
  listing: { short: "上架", full: "在售" },
  sold: { short: "成交", full: "已成交" },
};

/** 左列宽（项目名 + 阶段）：xl 及以上 208px，其余 160px（SPEC §4.6） */
export const LEFT_COL_CLASS = "w-[var(--rm-left)]";

export function parseDay(value: string): number {
  const [y, m, d] = value.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1);
}

export function dayToStr(t: number): string {
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(value: string, days: number): string {
  return dayToStr(parseDay(value) + days * DAY_MS);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseDay(to) - parseDay(from)) / DAY_MS);
}

/** 2026-04-10 → 2026.04.10；空值 →「—」 */
export function formatDot(value: string | null): string {
  return value ? value.replace(/-/g, ".") : "—";
}

export function formatWan(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return `${Number.isInteger(value) ? value : value.toFixed(2)}万`;
}

function toNumber(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
}

/** ProjectResponse → 时间轴行（Decimal 可能序列化为字符串，统一转 number） */
export function toRoadmapProject(p: ProjectResponse): RoadmapProject {
  return {
    id: p.id,
    name: p.name ?? p.community_name ?? "未命名项目",
    buildingNo: p.building_no ?? null,
    status: p.status,
    signingDate: p.signing_date ?? null,
    handoverDate: p.planned_handover_date ?? null,
    listingDate: p.listing_date ?? null,
    soldDate: p.sold_date ?? null,
    signingPrice: toNumber(p.signing_price),
    listPrice: toNumber(p.list_price),
    soldPrice: toNumber(p.sold_price),
    managerName: p.project_manager?.nickname ?? null,
    createdAt: p.created_at,
  };
}

/** 可绘制：有签约日期且不是「已下架」。归档项目保留（SPEC D6）。 */
export function isDrawable(p: RoadmapProject): boolean {
  return p.status !== "ended" && Boolean(p.signingDate);
}

/** 签约日期降序，同日按创建时间降序（后端已排序，前端再兜一次） */
export function sortRoadmapProjects(rows: RoadmapProject[]): RoadmapProject[] {
  return [...rows].sort((a, b) => {
    const sa = a.signingDate ?? "";
    const sb = b.signingDate ?? "";
    if (sa !== sb) return sa < sb ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

/**
 * 当前阶段：成交 → 上架 → 交房（已过交房日）→ 签约。
 * 与 `ProjectResponse.status` 解耦：状态字段可能滞后于实际日期（如已录成交日期
 * 但状态仍是在售），时间轴以日期为准。
 */
export function stageOf(p: RoadmapProject, today: string): RoadmapStage {
  if (p.soldDate) return "sold";
  if (p.listingDate) return "listing";
  if (p.handoverDate && p.handoverDate <= today) return "handover";
  return "sign";
}

/** 左列第二行：「签约中 · 12 天」「已成交 · 全程 96 天」 */
export function statusText(p: RoadmapProject, today: string): string {
  const stage = stageOf(p, today);
  const dwell = (from: string | null, to: string) =>
    from ? Math.max(0, daysBetween(from, to)) : 0;
  if (stage === "sold") {
    return `已成交 · 全程 ${dwell(p.signingDate, p.soldDate ?? today)} 天`;
  }
  if (stage === "listing") return `在售 · ${dwell(p.listingDate, today)} 天`;
  if (stage === "handover") return `交房中 · ${dwell(p.handoverDate, today)} 天`;
  return `签约中 · ${dwell(p.signingDate, today)} 天`;
}

/**
 * 四阶段段落：缺失节点按「下一个已知节点」收口，长度 ≤ 0 的段丢弃。
 * 成交是瞬时节点，不出段落（由调用方画圆点）。
 */
export function segmentsOf(p: RoadmapProject, today: string): RoadmapSegment[] {
  const segments: RoadmapSegment[] = [];
  const push = (stage: RoadmapStage, start: string | null, end: string | null) => {
    if (!start || !end) return;
    if (daysBetween(start, end) <= 0) return;
    segments.push({ stage, start, end });
  };

  if (p.signingDate) {
    push("sign", p.signingDate, p.handoverDate ?? p.listingDate ?? p.soldDate ?? today);
  }
  if (p.handoverDate) {
    push("handover", p.handoverDate, p.listingDate ?? p.soldDate ?? today);
  }
  if (p.listingDate) {
    push("listing", p.listingDate, p.soldDate ?? today);
  }
  return segments;
}

/**
 * 计划段虚线描边 + 图例/行首小圆点的「深一档」阶段色类名。
 *
 * 签约/交房需加深（浅色 1px 虚线在白底不可见），类名定义在 `globals.css`
 * 的 `@layer utilities`（`.rm-dash-*` / `.rm-dot-*`，字面量色值）；
 * 上架/成交本身是深色，直接复用 Ink/Rust 工具类。
 */
export const STAGE_DASH_CLASS: Record<RoadmapStage, string> = {
  sign: "rm-dash-sign",
  handover: "rm-dash-handover",
  listing: "border-ink/50",
  sold: "border-rust/50",
};

export const STAGE_DOT_CLASS: Record<RoadmapStage, string> = {
  sign: "rm-dot-sign",
  handover: "rm-dot-handover",
  listing: "bg-ink",
  sold: "bg-rust",
};

/** 时间域：最早签约前 14 天 ～ max(末节点, 今天) + 21 天 */
export function roadmapDomain(rows: RoadmapProject[], today: string): RoadmapDomain {
  const signs = rows.map((r) => r.signingDate).filter((d): d is string => Boolean(d));
  if (signs.length === 0) return { start: addDays(today, -14), end: addDays(today, 21) };

  const ends = rows
    .flatMap((r) => [r.soldDate, r.handoverDate, r.listingDate])
    .filter((d): d is string => Boolean(d));
  ends.push(today);

  const earliest = signs.reduce((a, b) => (a < b ? a : b));
  const latest = ends.reduce((a, b) => (a > b ? a : b));
  return { start: addDays(earliest, -14), end: addDays(latest, 21) };
}

/** 刻度密度随 ppd 变化：日宽 ≥2.2 每月，≥1.15 每季度，否则每半年 */
export function roadmapAxis(domain: RoadmapDomain, ppd: number): RoadmapAxis {
  const step = ppd >= 2.2 ? 1 : ppd >= 1.15 ? 3 : 6;
  const startT = parseDay(domain.start);
  const endT = parseDay(domain.end);
  const months: RoadmapMonthTick[] = [];
  const years: { t: number; label: string }[] = [];

  const first = new Date(startT);
  let cursor = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1);
  let lastYear = -1;

  while (cursor <= endT) {
    const d = new Date(cursor);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const t = Math.round((cursor - startT) / DAY_MS);
    if (t >= 0) {
      months.push({ t, label: `${month}月`, show: (month - 1) % step === 0 });
      if (year !== lastYear) {
        years.push({ t, label: `${year}` });
        lastYear = year;
      }
    }
    cursor = Date.UTC(year, month, 1);
  }
  return { months, years };
}

/** 悬停/聚焦浮层的四行：日期 + 到下一阶段的间隔 */
export function tooltipRows(p: RoadmapProject, today: string): RoadmapTipRow[] {
  const gap = (from: string | null, to: string | null) => {
    if (!from || !to) return "—";
    return `${Math.max(0, daysBetween(from, to))} 天`;
  };
  const signEnd = p.handoverDate ?? p.listingDate ?? p.soldDate ?? today;
  const handoverEnd = p.listingDate ?? p.soldDate ?? today;
  const listingEnd = p.soldDate ?? today;
  return [
    { stage: "sign", label: STAGE_LABEL.sign.short, date: p.signingDate, gap: gap(p.signingDate, signEnd) },
    {
      stage: "handover",
      label: STAGE_LABEL.handover.short,
      date: p.handoverDate,
      gap: gap(p.handoverDate, handoverEnd),
    },
    {
      stage: "listing",
      label: STAGE_LABEL.listing.short,
      date: p.listingDate,
      gap: gap(p.listingDate, listingEnd),
    },
    {
      stage: "sold",
      label: STAGE_LABEL.sold.short,
      date: p.soldDate,
      gap: p.soldDate ? `全程 ${gap(p.signingDate, p.soldDate)}` : "—",
    },
  ];
}

/** 行的无障碍标签：项目名 + 当前阶段 + 四个日期 */
export function rowAriaLabel(p: RoadmapProject, today: string): string {
  const stage = STAGE_LABEL[stageOf(p, today)].full;
  const date = (v: string | null) => (v ? formatDot(v) : "—");
  const building = p.buildingNo ? ` ${p.buildingNo}` : "";
  return `${p.name}${building}，当前${stage}；签约 ${date(p.signingDate)}，交房 ${date(
    p.handoverDate,
  )}，上架 ${date(p.listingDate)}，成交 ${date(p.soldDate)}`;
}
