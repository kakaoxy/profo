/**
 * 获客中心 · 漏斗页客户端安全常量。
 *
 * 不能与 `_lib/funnel-data.ts`（server-only，依赖 next/headers）混放：
 * 客户端组件从 server-only 模块导入任何运行时值都会导致客户端 bundle 编译失败。
 */

import type { GrowthModule } from "../types";

/** 漏斗页模块 Tab 取值（4 个业务模块 + 全部对比） */
export type FunnelTab = GrowthModule | "compare";

/** 允许的时间窗口快捷选项（天） */
export const FUNNEL_DAYS_OPTIONS = [7, 30, 90] as const;

/** 解析 URL days 参数，非法值回退 30 */
export function parseFunnelDays(raw: string | undefined): number {
  const parsed = Number(raw);
  return (FUNNEL_DAYS_OPTIONS as readonly number[]).includes(parsed) ? parsed : 30;
}

/** 解析 URL module 参数，非法值回退 recruit */
export function parseFunnelTab(raw: string | undefined): FunnelTab {
  return raw === "valuation" || raw === "booking" || raw === "sheet" || raw === "compare"
    ? raw
    : "recruit";
}
