/**
 * 「周二周期」窗口 · 跨业务共享纯函数.
 *
 * 周期为自然周的「周二 00:00 → 下周一 24:00」（等价于周二为一周之首的自然周；
 * 周一打开时展示上周二至今的累计新增）。已落地的两处消费方：
 * - 带看管理列表页三计数角标（原 pages/viewing/utils/sales-cycle.ts，已迁移至此共享）；
 * - 钥匙管理列表页指标 hero 区 +N 增量（后端 /keys/summary 同口径，窗口由服务端下发）。
 * 后端共享实现见 backend/services/projects/key_access.py 的 cycle_period（两端各自维护）。
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
