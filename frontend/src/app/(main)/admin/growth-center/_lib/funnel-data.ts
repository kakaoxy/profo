/**
 * 获客中心 · 跨模块漏斗 Server Component 数据获取层。
 *
 * 通过 `fetchClient`（含 httpOnly cookie 鉴权 + 401 自动刷新）访问后端
 * /admin/growth-center 聚合只读端点（鉴权 recruit:read），
 * 使用 React.cache 避免同请求内重复请求。
 */

import { cache } from "react";

import { fetchClient } from "@/lib/api-server";
import { logger } from "@/lib/logger";
import type { components } from "@/lib/api-types";
import type { GrowthModule } from "../types";

/** 单模块漏斗响应（steps 由后端按模块实际层级下发） */
export type GrowthFunnelData = components["schemas"]["FunnelResponse"];

/** 四模块漏斗对比响应（各模块 share 为基准 100%） */
export type GrowthFunnelCompareData = components["schemas"]["FunnelCompareResponse"];

/** 员工维度漏斗下钻响应（各行合计与单模块漏斗一致） */
export type GrowthEmployeeDrilldownData = components["schemas"]["EmployeeDrilldownResponse"];

// 客户端安全常量单独维护（server-only 模块不可被客户端组件导入运行时值）
export { FUNNEL_DAYS_OPTIONS, parseFunnelDays, parseFunnelTab } from "./funnel-constants";
export type { FunnelTab } from "./funnel-constants";

/** 获取单模块漏斗（module + days 窗口，Asia/Shanghai 自然日）。 */
export const getGrowthFunnel = cache(
  async (module: GrowthModule, days: number): Promise<GrowthFunnelData> => {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/admin/growth-center/funnel", {
      params: { query: { module, days } },
    });
    if (error || !data) {
      logger.error("[GrowthCenter] 获取漏斗数据失败:", error);
      throw new Error("获取漏斗数据失败");
    }
    return data;
  },
);

// 漏斗对比的唯一实现在 ./growth-data.ts（避免同端点双份 React.cache 包装漂移），此处 re-export
export { getGrowthFunnelCompare } from "./growth-data";

/** 获取员工维度漏斗下钻（含未归因聚合行，各行合计与该模块漏斗一致）。 */
export const getGrowthEmployeeDrilldown = cache(
  async (module: GrowthModule, days: number): Promise<GrowthEmployeeDrilldownData> => {
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/admin/growth-center/employees/drilldown", {
      params: { query: { module, days } },
    });
    if (error || !data) {
      logger.error("[GrowthCenter] 获取员工下钻失败:", error);
      throw new Error("获取员工下钻失败");
    }
    return data;
  },
);
