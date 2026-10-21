/**
 * 评估结论派生纯函数（小程序侧镜像实现）.
 *
 * ⚠️ 与 `frontend/src/lib/lead-verdict.ts` **必须逐值一致**。小程序无法跨包 import
 * 前端代码，故此处为镜像实现；两侧单测用同一份共享样本表
 * （`test-utils/utils/lead-verdict.cross-platform.test.ts` ↔
 * `frontend/src/lib/lead-verdict.cross-platform.test.ts`）断言输出相同。
 * **改一处必须同步另一处**，否则同一房源在后台与小程序会显示不同档位。
 *
 * 口径（见 docs/To-Do/2026-10-21-评估反馈迭代-落地SPEC.md）：
 * - 档位阈值 ≤30 快 / 31-60 正常 / 61-90 偏慢 / >90 慢（K5）；
 * - 「约 N 个月」= 天数/30 四舍五入到 1 位，整数不带小数点（K6）；
 * - 档位不入库（K4）；null/0/负数/NaN 统一显式降级（K13）。
 *
 * 全部为无副作用纯函数（无 wx.* 依赖），用 vitest 覆盖。
 */

/** 房源条件分（1-5）。 */
export type ScoreLevel = 1 | 2 | 3 | 4 | 5;

/** 可售周期档位 key（对应样式类后缀）。 */
export type CycleTier = "rush" | "normal" | "slowish" | "slow";

/** 评分短标签。 */
export const SCORE_LABELS: Record<ScoreLevel, string> = {
  1: "难售",
  2: "偏弱",
  3: "一般",
  4: "良好",
  5: "优质",
};

/** 评分锚点（员工自我对照用，仅前端文案，不入库）。 */
export const SCORE_ANCHORS: Record<ScoreLevel, string> = {
  1: "结构性难卖：暗厅暗卫 / 一层 / 产权复杂",
  2: "户型与楼层同时偏弱，或存在硬伤需重装化解",
  3: "户型或楼层有一项明显折价，需要靠价格补",
  4: "主流户型、有 1 项需在带看时说清的短板",
  5: "户型方正通透、当前楼层段在小区里最好卖",
};

/** 档位短词。 */
export const TIER_LABELS: Record<CycleTier, string> = {
  rush: "快",
  normal: "正常",
  slowish: "偏慢",
  slow: "慢",
};

/** 档位阈值（上界，含）。 */
const TIER_UPPER_BOUNDS: { max: number; tier: CycleTier }[] = [
  { max: 30, tier: "rush" },
  { max: 60, tier: "normal" },
  { max: 90, tier: "slowish" },
];

function isValidDays(days: number | null | undefined): days is number {
  return typeof days === "number" && Number.isFinite(days) && days > 0;
}

function isValidScore(score: number | null | undefined): score is ScoreLevel {
  return typeof score === "number" && Number.isInteger(score) && score >= 1 && score <= 5;
}

/** 评分短标签；无效入参返回 null。 */
export function scoreLabel(score: number | null | undefined): string | null {
  if (!isValidScore(score)) return null;
  return SCORE_LABELS[score];
}

/** 评分锚点；无效入参返回 null。 */
export function scoreAnchor(score: number | null | undefined): string | null {
  if (!isValidScore(score)) return null;
  return SCORE_ANCHORS[score];
}

/** 天数档位；无效入参返回 null。 */
export function daysTier(days: number | null | undefined): CycleTier | null {
  if (!isValidDays(days)) return null;
  for (const bound of TIER_UPPER_BOUNDS) {
    if (days <= bound.max) return bound.tier;
  }
  return "slow";
}

/** 天数档位短词；无效入参返回 null。 */
export function daysTierLabel(days: number | null | undefined): string | null {
  const tier = daysTier(days);
  return tier === null ? null : TIER_LABELS[tier];
}

/** 「约 N 个月」；无效入参返回空串。 */
export function daysSay(days: number | null | undefined): string {
  if (!isValidDays(days)) return "";
  const months = Math.round((days / 30) * 10) / 10;
  return `约 ${Number.isInteger(months) ? months.toFixed(0) : months.toFixed(1)} 个月`;
}

/** 卡片一行摘要：`45 天 · 约 1.5 月`；无效入参返回 `周期待补`。 */
export function daysSummary(days: number | null | undefined): string {
  if (!isValidDays(days)) return "周期待补";
  const months = Math.round((days / 30) * 10) / 10;
  const monthsText = Number.isInteger(months) ? months.toFixed(0) : months.toFixed(1);
  return `${days} 天 · 约 ${monthsText} 月`;
}

/** 详情页周期值文案（`45 天` / `周期待补`）。 */
export function daysValueText(days: number | null | undefined): string {
  return isValidDays(days) ? `${days} 天` : "周期待补";
}

/** 评分值文案（`4 / 5` / `未评分`）。 */
export function scoreValueText(score: number | null | undefined): string {
  return isValidScore(score) ? `${score} / 5` : "未评分";
}

/** 星级填充状态（长度恒为 5；无效入参全 false）。 */
export function scoreStars(score: number | null | undefined): boolean[] {
  const filled = isValidScore(score) ? score : 0;
  const out: boolean[] = [];
  for (let i = 0; i < 5; i += 1) out.push(i < filled);
  return out;
}
