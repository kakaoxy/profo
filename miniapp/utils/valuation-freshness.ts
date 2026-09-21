/**
 * 线索跟进时效纯函数：时效三态判定 / 标签文案 / 出现窗口 / 卡片左槽时间标签.
 *
 * 供评估工作台已处理卡（evaluate）与「我的评估」列表卡（list）复用，保证
 * 「同一套纯函数、同一套出现窗口」；全部为无副作用纯函数（无 wx.* 依赖），
 * 用 vitest 单测覆盖。
 *
 * 时效口径（Asia/Shanghai 自然日）：
 * - 基准时间 t = last_follow_up_at ?? audit_time；两者皆空 → 不显示标签（null）；
 * - 差值 d 按自然日相减（非 24h 累加）：23:50 与次日 00:10 算 1 天；
 * - d ≤ 7 → ok「跟进中」；7 < d ≤ 14 → soon「即将过期」（恰好 14 天归此档）；d > 14 → over「已过期」；
 * - 出现窗口：仅 pending_visit / visited（其余状态右下角留空）。
 */

import { pad2 } from "./format";

/** 时效三态。 */
export type FreshnessLevel = "ok" | "soon" | "over";

/** 时效标签文案（key 对应 fresh--{level} 样式类）。 */
export const FRESHNESS_LABELS: Record<FreshnessLevel, string> = {
  ok: "跟进中",
  soon: "即将过期",
  over: "已过期",
};

/** 时效标签出现窗口：仅跟进中的两种状态。 */
const FRESH_WINDOW_STATUSES: string[] = ["pending_visit", "visited"];

/** 终态集合：左槽时间前缀为「处理」，右下角不渲染时效标签。 */
const TERMINAL_STATUSES: string[] = ["signed", "rejected", "lost_to_competitor"];

/** Asia/Shanghai 固定 UTC+8（无夏令时），自然日判定用。 */
const TZ_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 解析为 Asia/Shanghai 自然日序号（自纪元天数）；非法 / 空返回 null. */
function shanghaiDayNumber(iso: string | number | Date | null | undefined): number | null {
  if (iso === null || iso === undefined || iso === "") {
    return null;
  }
  const t = new Date(iso as string).getTime();
  if (Number.isNaN(t)) {
    return null;
  }
  return Math.floor((t + TZ_OFFSET_MS) / DAY_MS);
}

/** 格式化为 MM-DD（按 Asia/Shanghai 日期部分）；非法 / 空返回 "—". */
function shortDate(iso: string | null | undefined): string {
  const day = shanghaiDayNumber(iso);
  if (day === null) {
    return "—";
  }
  const shifted = new Date(day * DAY_MS); // 已含 +8h 偏移，取 UTC 分量即上海日期
  return `${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
}

/**
 * 时效三态判定：基准时间距 now 的自然日差值分档.
 *
 * @param baselineISO 基准时间 ISO 串（last_follow_up_at ?? audit_time，由调用方回退）
 * @param now 当前时间（默认取系统时间；测试可注入固定值）
 * @returns "ok" | "soon" | "over"；基准时间为空 / 非法返回 null（不显示标签）
 */
export function freshnessLevel(
  baselineISO: string | null | undefined,
  now: string | number | Date = new Date(),
): FreshnessLevel | null {
  const baseline = shanghaiDayNumber(baselineISO);
  const nowDay = shanghaiDayNumber(now);
  if (baseline === null || nowDay === null) {
    return null;
  }
  const d = nowDay - baseline;
  if (d <= 7) {
    return "ok";
  }
  if (d <= 14) {
    return "soon";
  }
  return "over";
}

/** 是否处于时效标签出现窗口（仅 pending_visit / visited；终态与其余状态右下角留空）. */
export function isFreshnessWindow(status: string): boolean {
  return FRESH_WINDOW_STATUSES.indexOf(status) >= 0;
}

/** 卡片左槽时间标签入参（来自后端 HandledItem / PublicLeadListItem）. */
export interface CardTimeLabelInput {
  status: string;
  lastFollowUpAt?: string | null;
  auditTime?: string | null;
  createdAt?: string | null;
}

/**
 * 卡片左槽时间标签：前缀与取值随状态分档（与右侧时效标签同源）.
 *
 * - pending_visit / visited → 「跟进 MM-DD」，取 last_follow_up_at ?? audit_time；
 * - 终态（signed/rejected/lost_to_competitor）→ 「处理 MM-DD」，取 audit_time ?? created_at；
 * - 其余（pending_assessment 等）→ 「提交 MM-DD」，取 created_at。
 */
export function cardTimeLabel({ status, lastFollowUpAt, auditTime, createdAt }: CardTimeLabelInput): {
  prefix: string;
  text: string;
} {
  if (isFreshnessWindow(status)) {
    return { prefix: "跟进", text: shortDate(lastFollowUpAt || auditTime) };
  }
  if (TERMINAL_STATUSES.indexOf(status) >= 0) {
    return { prefix: "处理", text: shortDate(auditTime || createdAt) };
  }
  return { prefix: "提交", text: shortDate(createdAt) };
}
