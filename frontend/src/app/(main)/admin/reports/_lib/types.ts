/**
 * 商圈分析报表模块类型定义。
 *
 * 字段名对齐《数据报表规格 v3.2》的 SQL 语义（property_current schema 投影）。
 * 该文件为纯类型模块，无运行时副作用，可被 Server/Client Component 共同导入。
 */

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

/** 对比汇总行：行=指标，列=商圈（与 business_circles 对齐） */
export interface ComparisonSummaryRow {
  metric: string;
  values: (number | null)[];
}

/** 多商圈对比趋势点：周期 + 各商圈值 */
export interface ComparisonTrendPoint {
  period: string;
  [bc: string]: number | null | string;
}

/** 多商圈对比数据 */
export interface ComparisonData {
  business_circles: string[];
  summary: ComparisonSummaryRow[];
  /** 成交量趋势：每个周期一行，键为商圈名 */
  volume_trend: ComparisonTrendPoint[];
  /** 均价趋势：每个周期一行，键为商圈名 */
  price_trend: ComparisonTrendPoint[];
  /** 楼层结构（成交占比） */
  floor_structure: { business_circle: string; low: number; mid: number; high: number }[];
  /** 户型结构（成交占比） */
  room_structure: {
    business_circle: string;
    r1: number;
    r2: number;
    r3: number;
    r4plus: number;
  }[];
}

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
