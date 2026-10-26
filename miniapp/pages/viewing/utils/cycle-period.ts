/**
 * 「周二周期」窗口纯函数（仅带看分包使用）.
 *
 * 周期为自然周的「周二 00:00 → 下周一 24:00」（等价于周二为一周之首的自然周；
 * 周一打开时展示上周二至今的累计新增）。当前唯一消费方：
 * - 带看管理列表页三计数角标（pages/viewing/projects/index）。
 * 钥匙管理列表页的同口径窗口由服务端 /keys/summary 下发，前端不引用本文件；
 * 后端共享实现见 backend/services/projects/key_access.py 的 cycle_period（两端各自维护）。
 *
 * 注意：本文件位于 viewing 分包内（原在主包 utils/，因仅分包引用被开发者工具
 * 判为主包冗余 JS）；若未来主包代码需要引用，需移回 utils/。
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
