/**
 * 评估结论派生纯函数：房源条件分标签 / 装修后可售周期档位与「约 N 个月」文案.
 *
 * 单一事实源：admin、C 端 Web 与小程序（miniapp/utils/lead-verdict.ts）共用同一套口径。
 * 小程序无法跨包 import，故两侧各一份**镜像实现**；两侧单测用同一份共享样本表
 * （lead-verdict.cross-platform.test.ts）断言输出逐字节相同 —— 改一处必须同步另一处。
 *
 * 设计口径（见 docs/To-Do/2026-10-21-评估反馈迭代-落地SPEC.md）：
 * - 档位阈值 ≤30 快 / 31-60 正常 / 61-90 偏慢 / >90 慢（K5）；
 *   该阈值沿用项目既有「带看时效」分档语感，**非市场校准结果**；
 * - 「约 N 个月」由天数/30 四舍五入到 1 位小数派生，整数不带小数点（K6）；
 * - 档位是机器判断、月份是人话翻译，两者不必对齐（如 30 与 31 天同显「约 1 个月」）；
 * - 档位**不入库**：阈值会调，改阈值不该刷全表（K4）。
 */

/** 房源条件分（1-5）。 */
export type ScoreLevel = 1 | 2 | 3 | 4 | 5;

/** 可售周期档位 key（对应样式类后缀）。 */
export type CycleTier = "rush" | "normal" | "slowish" | "slow";

/** 评分短标签（与锚点表一致，文案层唯一来源）。 */
export const SCORE_LABELS: Record<ScoreLevel, string> = {
  1: "难售",
  2: "偏弱",
  3: "一般",
  4: "良好",
  5: "优质",
};

/**
 * 评分锚点（员工自我对照用，仅前端文案，不入库）。
 *
 * 锚点存在的理由：没有锚点的跨人评分等于噪声 —— 「4 分」在不同员工手里必须指同一件事。
 */
export const SCORE_ANCHORS: Record<ScoreLevel, string> = {
  1: "结构性难卖：暗厅暗卫 / 一层 / 产权复杂",
  2: "户型与楼层同时偏弱，或存在硬伤需重装化解",
  3: "户型或楼层有一项明显折价，需要靠价格补",
  4: "主流户型、有 1 项需在带看时说清的短板",
  5: "户型方正通透、当前楼层段在小区里最好卖",
};

/** 档位短词（快 / 正常 / 偏慢 / 慢）。 */
export const TIER_LABELS: Record<CycleTier, string> = {
  rush: "快",
  normal: "正常",
  slowish: "偏慢",
  slow: "慢",
};

/** 档位阈值（上界，含）。 */
const TIER_UPPER_BOUNDS: readonly { max: number; tier: CycleTier }[] = [
  { max: 30, tier: "rush" },
  { max: 60, tier: "normal" },
  { max: 90, tier: "slowish" },
];

/** 有效天数的判定（null/负数/NaN/0 均视为无效）。 */
function isValidDays(days: number | null | undefined): days is number {
  return typeof days === "number" && Number.isFinite(days) && days > 0;
}

/** 有效评分判定。 */
function isValidScore(score: number | null | undefined): score is ScoreLevel {
  return typeof score === "number" && Number.isInteger(score) && score >= 1 && score <= 5;
}

/**
 * 评分短标签。
 *
 * @param score 房源条件分
 * @returns 短标签；入参为空/越界返回 null（调用方渲染降级态）
 */
export function scoreLabel(score: number | null | undefined): string | null {
  if (!isValidScore(score)) return null;
  return SCORE_LABELS[score];
}

/**
 * 评分锚点文案。
 *
 * @param score 房源条件分
 * @returns 锚点；入参为空/越界返回 null
 */
export function scoreAnchor(score: number | null | undefined): string | null {
  if (!isValidScore(score)) return null;
  return SCORE_ANCHORS[score];
}

/**
 * 天数档位。
 *
 * @param days 装修后预计可售天数
 * @returns 档位 key；入参无效返回 null
 */
export function daysTier(days: number | null | undefined): CycleTier | null {
  if (!isValidDays(days)) return null;
  for (const bound of TIER_UPPER_BOUNDS) {
    if (days <= bound.max) return bound.tier;
  }
  return "slow";
}

/**
 * 天数档位短词。
 *
 * @param days 装修后预计可售天数
 * @returns 快/正常/偏慢/慢；入参无效返回 null
 */
export function daysTierLabel(days: number | null | undefined): string | null {
  const tier = daysTier(days);
  return tier === null ? null : TIER_LABELS[tier];
}

/**
 * 「约 N 个月」人话翻译（K6）。
 *
 * @param days 装修后预计可售天数
 * @returns 如 `约 1.5 个月`；入参无效返回空串（调用方自行决定是否渲染）
 */
export function daysSay(days: number | null | undefined): string {
  if (!isValidDays(days)) return "";
  const months = Math.round((days / 30) * 10) / 10;
  return `约 ${Number.isInteger(months) ? months.toFixed(0) : months.toFixed(1)} 个月`;
}

/**
 * 卡片一行摘要：`45 天 · 约 1.5 月`（列表卡结论条用）。
 *
 * @param days 装修后预计可售天数
 * @returns 摘要文案；入参无效返回 `周期待补`（显式降级，不留空白）
 */
export function daysSummary(days: number | null | undefined): string {
  if (!isValidDays(days)) return "周期待补";
  const months = Math.round((days / 30) * 10) / 10;
  const monthsText = Number.isInteger(months) ? months.toFixed(0) : months.toFixed(1);
  return `${days} 天 · 约 ${monthsText} 月`;
}

/**
 * 详情页双指标里的周期值文案（`45 天` / `周期待补`）。
 *
 * @param days 装修后预计可售天数
 * @returns 天数文案；入参无效返回 `周期待补`
 */
export function daysValueText(days: number | null | undefined): string {
  return isValidDays(days) ? `${days} 天` : "周期待补";
}

/**
 * 评分值文案（`4 / 5` / `未评分`）。
 *
 * @param score 房源条件分
 * @returns 评分文案；入参无效返回 `未评分`
 */
export function scoreValueText(score: number | null | undefined): string {
  return isValidScore(score) ? `${score} / 5` : "未评分";
}

/**
 * 星级填充状态（供 UI 渲染 5 颗星：true = 实心）。
 *
 * @param score 房源条件分
 * @returns 长度恒为 5 的布尔数组；入参无效时全 false
 */
export function scoreStars(score: number | null | undefined): boolean[] {
  const filled = isValidScore(score) ? score : 0;
  return Array.from({ length: 5 }, (_, i) => i < filled);
}
