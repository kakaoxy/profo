/**
 * 「周二周期」窗口纯函数（向后兼容转发层）.
 *
 * 实现已迁移至 utils/cycle-period.ts（钥匙管理列表页指标 hero 区与带看管理
 * 角标共用同一「周二周期」口径，2026-10-10 起）；本文件保留转发以兼容既有
 * import 路径，新代码请直接 import utils/cycle-period.
 */
export { cycleStart, isInCycle } from "../../../utils/cycle-period";
