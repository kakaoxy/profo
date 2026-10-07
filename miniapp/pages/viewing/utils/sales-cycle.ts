/**
 * 周期新增角标 · 周期窗口纯函数.
 *
 * 「我负责的项目」列表页三计数（带看/出价/面谈）旁的 +N 角标，统计的是
 * 「当前周期」内新增的记录数。周期为自然周的「周二 00:00 → 下周一 24:00」
 * （等价于周二为一周之首的自然周；周一打开时展示上周二至今的累计新增）。
 *
 * 与项目列表页的分工：本文件只提供窗口计算纯函数；记录解析仍统一走
 * parseSalesRecords（类型收窄），角标数值在列表页 toDisplay 内派生，
 * 不落库、不存储，打开即算（见设计稿 docs/2026-10-07-带看出价面谈周期角标-高保真设计稿.html 口径⑥）。
 */

/**
 * 当前周期起点（本周二 00:00，本地时区）；周一返回上周二 00:00.
 *
 * dayFromMonday: 周一=0 … 周日=6；offset: 周一→6、周二→0、周三→1 … 周日→5。
 * 等价于「周二为一周之首」的自然周起点；跨年由 Date 构造天然支持。
 */
export function cycleStart(now: Date = new Date()): Date {
  const dayFromMonday = (now.getDay() + 6) % 7; // 一0…日6
  const offset = (dayFromMonday + 6) % 7; // 一6 二0 三1 四2 五3 六4 日5
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
}

/** 记录时间戳是否落入周期窗口（[startMs, +∞)）。非法时间（NaN）恒 false，天然安全. */
export function isInCycle(ts: number, startMs: number): boolean {
  return ts >= startMs;
}
