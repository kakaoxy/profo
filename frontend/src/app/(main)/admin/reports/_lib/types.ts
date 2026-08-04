/**
 * 商圈分析报表模块类型定义。
 *
 * 字段名对齐《数据报表规格 v3.2》的 SQL 语义（property_current schema 投影）。
 * 该文件为纯类型模块，无运行时副作用，可被 Server/Client Component 共同导入。
 */

import type { components } from "@/lib/api-types";

// ─── 基础数据 ────────────────────────────────────────────────────────────────────

/** 房源记录（property_current schema 投影） */
export interface MockProperty {
  id: number;
  /** 小区ID（UUID字符串） */
  community_id: string;
  community_name: string;
  business_circle: string;
  district: string;
  rooms: number | null;
  halls: number | null;
  floor_level: "低楼层" | "中楼层" | "高楼层" | null;
  build_area: number | null;
  /** 成交总价（万元）；在售记录可能为 null */
  sold_price_wan: number | null;
  status: "在售" | "成交";
  /** 成交日期 YYYY-MM-DD；在售记录为 null */
  sold_date: string | null;
  data_source: "链家" | "贝壳" | "网签";
  is_active: boolean;
  /** 数据更新时间 ISO 字符串 */
  updated_at: string;
}

// ─── 行级聚合数据 ────────────────────────────────────────────────────────────────

/** 商圈列表行 */
export interface BusinessDistrictRow {
  business_circle: string;
  district: string;
  sold_count: number;
  avg_price_wan: number | null;
  /** 平均单价（元/㎡） */
  avg_unit_price: number | null;
  on_sale_count: number;
  /** 去化周期（月）；分母为 0 时为 null */
  absorption_months: number | null;
  /** 价格环比 (%) */
  price_qoq: number | null;
  /** 成交量环比 (%) */
  volume_qoq: number | null;
}

/** 小区行 */
export interface CommunityRow {
  /** 小区ID（UUID字符串） */
  community_id: string;
  community_name: string;
  business_circle: string;
  district: string;
  sold_count: number;
  avg_price_wan: number | null;
  avg_unit_price: number | null;
  /** 主力户型（如 "2室2厅"） */
  main_layout: string | null;
  /** 主力楼层（如 "中楼层"） */
  main_floor: string | null;
  avg_area: number | null;
  price_qoq: number | null;
}

// ─── KPI ─────────────────────────────────────────────────────────────────────────

export type QoqDirection = "up" | "down" | "flat" | "unknown";

/** 单张 KPI 卡片数据 */
export interface KpiCard {
  value: number | null;
  /** 环比 (%)；样本不足或上期为 0 时为 null */
  qoq: number | null;
  qoq_direction: QoqDirection;
}

/** 报表页 4 张 KPI 卡片聚合 */
export interface KpiData {
  sold_count: KpiCard;
  avg_price_wan: KpiCard;
  avg_unit_price: KpiCard;
  on_sale_count: KpiCard;
}

// ─── 趋势 ─────────────────────────────────────────────────────────────────────────

/** 趋势数据点（周/月粒度） */
export interface TrendDataPoint {
  /** 周期起始日期 YYYY-MM-DD；展示时由 formatPeriod 转为 W28 / 2026-07 */
  period: string;
  volume: number;
  avg_price_wan: number | null;
  avg_unit_price: number | null;
  /** 量环比 (%)；首期或上期样本不足时为 null */
  volume_qoq: number | null;
  /** 价环比 (%)；首期或上期样本不足时为 null */
  price_qoq: number | null;
  /** 维度下钻（户型/楼层/价格段）；overall 维度无此字段 */
  dim_breakdown?: Record<string, { volume: number; avg_unit_price: number | null }>;
}

// ─── 价格分布 ────────────────────────────────────────────────────────────────────

/** 价格分布桶 */
export interface PriceBucket {
  /** 桶标签（如 "150-200万" 或 "<150" 或 "350+"） */
  label: string;
  /** 下限（万元）；最低桶为 0 */
  lower: number;
  /** 上限（万元）；最高桶为 null（开放区间） */
  upper: number | null;
  count: number;
  avg_area: number | null;
  avg_unit_price: number | null;
}

/** 通用分布桶（户型/楼层分布） */
export interface DistributionBucket {
  /** 桶标签（如 "1室" / "4室+" / "低楼层" / "中楼层" / "高楼层"） */
  label: string;
  count: number;
  avg_area: number | null;
  avg_unit_price: number | null;
}

// ─── 对比 ─────────────────────────────────────────────────────────────────────────

// F1: 直接引用生成类型，避免手写 DTO 与后端 schema 漂移；
// ComparisonTrendPoint 索引签名为 `[key: string]: unknown`，消费方需做 typeof 窄化。
export type ComparisonSummaryRow = components["schemas"]["ComparisonSummaryRow"];
export type ComparisonTrendPoint = components["schemas"]["ComparisonTrendPoint"];
export type ComparisonData = components["schemas"]["ComparisonData"];

// ─── 筛选 ─────────────────────────────────────────────────────────────────────────

/** 时间范围选项：4w/8w=周；6m/12m/24m=月 */
export type RangeOption = "4w" | "8w" | "6m" | "12m" | "24m";

/** 趋势粒度 */
export type Granularity = "week" | "month";

/** 房源状态 */
export type PropertyStatus = "在售" | "成交";

/** 趋势维度 */
export type TrendDimension = "overall" | "rooms" | "floor" | "price";

/** 报表全局筛选 */
export interface ReportsFilter {
  range: RangeOption;
  sources: string[];
  district: string | null;
  business_circle: string | null;
  /** 小区ID（UUID字符串），null 表示全部 */
  community_id: string | null;
  status: PropertyStatus;
  rooms: number[];
  floor_levels: string[];
}
