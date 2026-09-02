/**
 * 我的客户列表页 · 展示映射常量与纯函数（仅 pages/customers/mine 消费）.
 *
 * 从 index.ts 拆出以遵守「单文件 <500 行」约束：
 * - 模块 tabs / 统一状态 chips 常量与元信息映射（文案/配色类/操作按钮组）
 * - 相对时间格式化与模块差异摘要拼装（buildSummary/toDisplayItem）
 * 不含任何请求与页面实例逻辑。
 */
import type { components } from "../../../types/api-types";
import { statusLabel } from "../detail/constants";

type GrowthModule = components["schemas"]["GrowthModule"];
type UnifiedLeadStatus = components["schemas"]["UnifiedLeadStatus"];
type LeadSource = components["schemas"]["LeadSource"];
type MyCustomerListItem = components["schemas"]["MyCustomerListItem"];

/** 客户卡片展示结构. */
export interface CustomerDisplayItem {
  id: string;
  module: GrowthModule;
  moduleText: string;
  dotClass: string;
  phone: string;
  /** 查看后的完整号码（非空时再次点击直接拨打）. */
  phoneFull: string;
  statusValue: UnifiedLeadStatus;
  statusText: string;
  statusClass: string;
  summary: string;
  /** 来源文案（空串不渲染来源 chip）. */
  sourceText: string;
  timeText: string;
  primaryText: string;
  flowText: string;
  viewText: string;
}

/** 模块 tab 展示结构（count 由列表响应 module_counts 填充）. */
export interface ModuleTab {
  value: string;
  label: string;
  dotClass: string;
  count: number;
}

/** 状态 chip 展示结构（全部 count=-1 表示不渲染计数）. */
export interface StatusChip {
  value: string;
  label: string;
  count: number;
}

/** 模块 tabs 常量（value 空串=全部；固定色点见 wxss mdot--*）. */
export const MODULE_TABS: { value: string; label: string; dotClass: string }[] = [
  { value: "", label: "全部", dotClass: "mdot--all" },
  { value: "valuation", label: "估价", dotClass: "mdot--valuation" },
  { value: "booking", label: "预约", dotClass: "mdot--booking" },
  { value: "sheet", label: "房源单", dotClass: "mdot--sheet" },
  { value: "recruit", label: "招募", dotClass: "mdot--recruit" },
];

/** 统一状态 chips 常量（value 空串=全部，不带计数）. */
export const STATUS_CHIPS: { value: string; label: string }[] = [
  { value: "", label: "全部" },
  { value: "new", label: "新线索" },
  { value: "contacted", label: "已联系" },
  { value: "high_intent", label: "意向高" },
  { value: "converted", label: "已转化" },
  { value: "eliminated", label: "已淘汰" },
];

/** 统一状态 → 标签文案/配色类（stg-*，配色见 wxss）. */
export const STATUS_META: Record<UnifiedLeadStatus, { text: string; cls: string }> = {
  new: { text: "新线索", cls: "stg-new" },
  contacted: { text: "已联系", cls: "stg-contact" },
  high_intent: { text: "意向高", cls: "stg-high" },
  converted: { text: "已转化", cls: "stg-converted" },
  eliminated: { text: "已淘汰", cls: "stg-eliminated" },
};

/** 模块 → 标签文案/色点类. */
export const MODULE_META: Record<GrowthModule, { text: string; cls: string }> = {
  valuation: { text: "估价", cls: "mdot--valuation" },
  booking: { text: "预约", cls: "mdot--booking" },
  sheet: { text: "房源单", cls: "mdot--sheet" },
  recruit: { text: "招募", cls: "mdot--recruit" },
};

/** 来源 → 文案（source 为 null 不渲染 chip）. */
export const SOURCE_TEXT: Record<LeadSource, string> = {
  card: "客户分享",
  poster: "海报",
  direct: "员工录入",
};

/** 统一状态 → 卡片操作按钮组. */
export const ACTION_BY_STATUS: Record<
  UnifiedLeadStatus,
  { primaryText: string; flowText: string; viewText: string }
> = {
  new: { primaryText: "联系客户", flowText: "状态流转", viewText: "" },
  contacted: { primaryText: "再次联系", flowText: "状态流转", viewText: "" },
  high_intent: { primaryText: "再次联系", flowText: "状态流转", viewText: "" },
  converted: { primaryText: "", flowText: "", viewText: "查看详情" },
  eliminated: { primaryText: "", flowText: "", viewText: "查看详情" },
};

/**
 * 留资时间相对格式化.
 * - 当天 → 今天 HH:mm；昨天 → 昨天 HH:mm
 * - 同年 → MM-DD HH:mm；跨年 → YYYY-MM-DD
 */
export function formatLeadTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (dayDiff === 0) {
    return `今天 ${hm}`;
  }
  if (dayDiff === 1) {
    return `昨天 ${hm}`;
  }
  if (d.getFullYear() === now.getFullYear()) {
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 预约时间格式化（摘要行用）：同年 MM-DD HH:mm，跨年含年份. */
function formatBookingTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.getFullYear() === now.getFullYear()) {
    return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`;
  }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 模块差异摘要行（对齐设计稿 lc-sub：非空段以「 · 」连接，全空回退原生状态值）. */
function buildSummary(item: MyCustomerListItem): string {
  if (item.module === "recruit") {
    const seg = item.main_business_area || item.campaign_name || "";
    return seg ? `报名合伙人 · 主营商圈：${seg}` : "报名合伙人";
  }
  if (item.module === "booking") {
    const segs = [item.property_title || "", item.booking_time ? formatBookingTime(item.booking_time) : ""].filter(
      Boolean,
    );
    return segs.length ? segs.join(" · ") : item.native_status;
  }
  if (item.module === "sheet") {
    const name = item.community_name
      ? item.sheet_item_count
        ? `${item.community_name}（共 ${item.sheet_item_count} 套）`
        : item.community_name
      : "";
    const segs = [name, item.sheet_code ? `短码 ${item.sheet_code}` : ""].filter(Boolean);
    return segs.length ? segs.join(" · ") : item.native_status;
  }
  // valuation：小区 · 户型 · 面积 · 预期价
  const segs = [
    item.community_name || "",
    item.layout || "",
    item.area ? `${item.area}㎡` : "",
    item.expected_price ? `预期价 ${item.expected_price}万` : "",
  ].filter(Boolean);
  return segs.length ? segs.join(" · ") : item.native_status;
}

/** 列表项 → 展示结构（状态标签按模块映射（booking 用预约线文案）/来源 chip/相对时间/操作按钮组）. */
export function toDisplayItem(item: MyCustomerListItem): CustomerDisplayItem {
  const actions = ACTION_BY_STATUS[item.unified_status];
  return {
    id: item.id,
    module: item.module,
    moduleText: MODULE_META[item.module].text,
    dotClass: MODULE_META[item.module].cls,
    phone: item.phone_masked || "未提供",
    phoneFull: "",
    statusValue: item.unified_status,
    statusText: statusLabel(item.unified_status, item.module),
    statusClass: STATUS_META[item.unified_status].cls,
    summary: buildSummary(item),
    sourceText: item.source ? SOURCE_TEXT[item.source] || "" : "",
    timeText: formatLeadTime(item.created_at),
    ...actions,
  };
}
