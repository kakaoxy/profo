/**
 * 项目卡片工具函数统一导出
 * 各功能模块已拆分到独立文件，此处仅作统一入口
 */

// 类型定义
export type { ApiSalesRecord, ValidRecordType, TransformedSalesRecord } from "./project-card-types";
export { isValidRecordType } from "./project-card-types";

// 统计计算
export { getWeekViewStats, getOfferStats } from "./project-card-stats";

// 数据验证
export { validateSalesRecords, validateAndTransformSalesRecords } from "./project-card-validation";

// 数据映射
export { mapProjectResponseToProject } from "./project-card-mapper";

// 数字工具（从 number-utils 重新导出以保持兼容）
export { toNumber } from "@/lib/number-utils";
