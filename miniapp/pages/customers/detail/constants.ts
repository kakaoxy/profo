/**
 * 客户详情页常量与纯函数（从 index.ts 拆出，控制单文件行数）.
 *
 * 状态配色 / hero 文案 / 流转矩阵 / 面板选项文案均对照：
 * - 设计稿 docs/To-Do/2026-09-02-小程序我的客户-高保真设计稿.html（03/04 屏）
 * - 后端契约 services/growth_center/my_customers_flow.py（_TRANSITIONS）
 */
import type { components } from "../../../types/api-types";
import type { HttpResponseError } from "../../../utils/request";
import { formatLeadTime } from "../../../utils/recruit-logic";

/** 获客模块（openapi 生成类型别名）. */
export type GrowthModule = components["schemas"]["GrowthModule"];
/** 统一线索状态（openapi 生成类型别名）. */
export type UnifiedLeadStatus = components["schemas"]["UnifiedLeadStatus"];
/** 详情响应. */
export type CustomerDetail = components["schemas"]["MyCustomerDetailResponse"];
/** 归因时间线事件. */
export type TimelineEvent = components["schemas"]["TimelineEvent"];
/** 完整手机号响应. */
export type PhoneResponse = components["schemas"]["MyCustomerPhoneResponse"];
/** 状态流转响应. */
export type StatusUpdateResponse = components["schemas"]["MyCustomerStatusUpdateResponse"];
/** 跟进记录项. */
export type FollowUpItem = components["schemas"]["MyCustomerFollowUpItem"];

/** 缺失字段占位符. */
const DASH = "—";

/** 非归属/不存在（404）与登录态/权限异常（401/403）统一空态兜底. */
export const HTTP_NOT_FOUND = 404;
export const HTTP_UNAUTHORIZED = 401;
export const HTTP_FORBIDDEN = 403;

/** 模块中文名（手机号卡 label / hero 文案键）. */
export const MODULE_LABELS: Record<GrowthModule, string> = {
  valuation: "估价",
  booking: "预约",
  sheet: "房源单",
  recruit: "招募",
};

/** 业务栅格卡标题. */
export const INFO_CARD_TITLES: Record<GrowthModule, string> = {
  valuation: "估价信息",
  booking: "预约信息",
  sheet: "房源单信息",
  recruit: "招募信息",
};

/** 统一状态标签（文案 + 配色类）. */
export const STATUS_META: Record<UnifiedLeadStatus, { text: string; cls: string }> = {
  new: { text: "新线索", cls: "stg-new" },
  contacted: { text: "已联系", cls: "stg-contact" },
  high_intent: { text: "意向高", cls: "stg-high" },
  converted: { text: "已转化", cls: "stg-won" },
  eliminated: { text: "已淘汰", cls: "stg-out" },
};

/** 来源标签（source 为 null 显示「—」）. */
export const SOURCE_LABELS: Record<"card" | "poster" | "direct", string> = {
  card: "卡片分享",
  poster: "海报分享",
  direct: "直接进入",
};

/** hero 建议文案结构. */
export interface HeroCopy {
  title: string;
  sub: string;
}

/** 进行中状态（new/contacted/high_intent）的建议文案，按模块差异化. */
export const HERO_ACTIVE_COPY: Record<"new" | "contacted" | "high_intent", Record<GrowthModule, HeroCopy>> = {
  new: {
    valuation: { title: "客户刚提交估价申请", sub: "建议尽快电话联系，确认卖房意向与房屋信息，再发起正式评估。" },
    booking: { title: "客户刚提交预约申请", sub: "建议尽快电话联系，确认带看时间与需求，跟进预约安排。" },
    sheet: { title: "客户刚提交房源单承接", sub: "建议尽快电话联系，确认承接意向与房源需求。" },
    recruit: { title: "客户刚提交合伙报名", sub: "建议尽快电话联系，确认合伙意向与主营商圈，推进入驻。" },
  },
  contacted: {
    valuation: { title: "已联系客户，推进评估流程", sub: "已电话 / 微信联系客户，评估授权与看房安排由业务流程自动推进。" },
    booking: { title: "已联系客户，确认预约安排", sub: "继续与客户确认带看时间，跟进预约落实。" },
    sheet: { title: "已联系客户，确认承接意向", sub: "继续沟通房源需求，推进承接流程。" },
    recruit: { title: "已联系客户，初步沟通完成", sub: "继续跟进确认合伙意向，可标记意向高推进。" },
  },
  high_intent: {
    valuation: { title: "客户意向高，重点跟进", sub: "客户明确表达意向，尽快推进评估授权与看房安排。" },
    booking: { title: "客户意向高，重点跟进", sub: "客户明确表达意向，尽快落实带看与后续安排。" },
    sheet: { title: "客户意向高，重点跟进", sub: "客户明确表达承接意向，尽快推进承接流程。" },
    recruit: { title: "客户意向高，重点跟进", sub: "客户合伙意向明确，尽快推进签约入驻。" },
  },
};

/** 终态建议文案（converted/eliminated 与模块无关）. */
export const HERO_TERMINAL_COPY: Record<"converted" | "eliminated", HeroCopy> = {
  converted: { title: "客户已转化", sub: "合作已达成，状态为终态不可逆。" },
  eliminated: { title: "客户已淘汰", sub: "线索已淘汰（无意向 / 信息无效 / 他司成交），二期支持备注后重新激活。" },
};

/**
 * 模块感知流转矩阵（模块 × 当前状态 → 可流转目标状态；终态为空数组，按钮区显示终态说明）。
 * 与后端契约对齐（my_customers_flow.py，spec「仅淘汰旁路可写」）：
 * - recruit：全量手动流转（主链路 + 淘汰旁路）；
 * - valuation/sheet：仅 eliminated 淘汰旁路（其余流转后端 409）；
 * - booking：预约状态机二期，不支持手动流转（wxml 分支单独提示）。
 */
export const FLOW_MATRIX: Record<GrowthModule, Record<UnifiedLeadStatus, UnifiedLeadStatus[]>> = {
  recruit: {
    new: ["contacted", "high_intent", "converted", "eliminated"],
    contacted: ["high_intent", "converted", "eliminated"],
    high_intent: ["converted", "eliminated"],
    converted: [],
    eliminated: [],
  },
  valuation: {
    new: ["eliminated"],
    contacted: ["eliminated"],
    high_intent: ["eliminated"],
    converted: [],
    eliminated: [],
  },
  booking: {
    new: [],
    contacted: [],
    high_intent: [],
    converted: [],
    eliminated: [],
  },
  sheet: {
    new: ["eliminated"],
    contacted: ["eliminated"],
    high_intent: ["eliminated"],
    converted: [],
    eliminated: [],
  },
};

/** 面板目标状态描述（对照设计稿 04 屏）. */
export const FLOW_OPTION_DESC: Record<Exclude<UnifiedLeadStatus, "new">, string> = {
  contacted: "已电话 / 微信联系客户，确认基本信息",
  high_intent: "明确表达卖房 / 带看 / 合伙意向",
  converted: "完成签约 / 成交 / 合伙入驻",
  eliminated: "无意向 / 信息无效 / 他司成交，需填写原因",
};

/** 「推荐」下一步（new→contacted、contacted→high_intent、high_intent→converted）. */
export const RECOMMENDED_NEXT: Partial<Record<UnifiedLeadStatus, UnifiedLeadStatus>> = {
  new: "contacted",
  contacted: "high_intent",
  high_intent: "converted",
};

/** 淘汰原因单选（reason 取值与后端契约对齐）. */
export const ELIMINATE_REASONS: { value: string; label: string }[] = [
  { value: "no_intent", label: "无意向" },
  { value: "invalid_info", label: "信息无效" },
  { value: "lost_to_competitor", label: "他司成交" },
];

/** 主链路 4 节点（进度条顺序，eliminated 为旁路不占节点）. */
export const FLOW_NODES: { status: UnifiedLeadStatus; label: string }[] = [
  { status: "new", label: "新线索" },
  { status: "contacted", label: "已联系" },
  { status: "high_intent", label: "意向高" },
  { status: "converted", label: "已转化" },
];

/** 终态说明（无操作按钮时展示；进行中状态不使用）. */
export const TERMINAL_NOTES: Record<UnifiedLeadStatus, string> = {
  new: "",
  contacted: "",
  high_intent: "",
  converted: "客户已转化，状态为终态不可逆。",
  eliminated: "线索已淘汰为终态，二期支持备注后重新激活。",
};

/** 业务栅格单项展示结构. */
export interface InfoItem {
  k: string;
  v: string;
  /** 灰显（待评估等占位）. */
  mut?: boolean;
  /** 等宽数字. */
  num?: boolean;
}

/** 时间线单项展示结构. */
export interface TimelineDisplay {
  idx: number;
  text: string;
  timeText: string;
  dim: boolean;
}

/** 进度条节点展示结构. */
export interface FlowNodeDisplay {
  num: number;
  label: string;
  /** done=已过节点（apricot）；「done cur」=当前节点（rust 实底+光圈）. */
  cls: string;
}

/** 流转操作按钮展示结构. */
export interface FlowActionDisplay {
  status: UnifiedLeadStatus;
  label: string;
  /** 首位 btn-ink、次位 btn-warm、其余 btn-ghost. */
  cls: string;
}

/** 面板目标状态选项展示结构. */
export interface FlowOptionDisplay {
  status: UnifiedLeadStatus;
  label: string;
  desc: string;
  recommended: boolean;
  stgClass: string;
}

/** 跟进记录展示结构. */
export interface FollowUpDisplay {
  id: string;
  content: string;
  timeText: string;
  authorText: string;
}

/** 从错误响应提取后端 message（{"code","message"} 或 FastAPI {detail}）. */
export function extractErrorMessage(err: unknown, fallback: string): string {
  const body = (err as HttpResponseError).body;
  if (body && typeof body === "object") {
    const b = body as { message?: unknown; detail?: unknown };
    if (typeof b.message === "string" && b.message) {
      return b.message;
    }
    if (typeof b.detail === "string" && b.detail) {
      return b.detail;
    }
  }
  return fallback;
}

/** 时间线事件文案（后端 label 为主，share/deep_view 附加上下文）. */
export function timelineText(ev: TimelineEvent): string {
  if (ev.event === "share") {
    const suffix = ev.share_type === "poster" ? "（海报）" : ev.share_type === "card" ? "（卡片）" : "";
    return `员工分享${suffix}`;
  }
  if (ev.event === "deep_view" && ev.stayed_ms) {
    return `${ev.label}（停留${Math.round(ev.stayed_ms / 1000)}秒）`;
  }
  return ev.label;
}

/** 跟进记录项 → 展示结构（相对时间 + 跟进人）. */
export function toFollowUpDisplay(item: FollowUpItem): FollowUpDisplay {
  return {
    id: item.id,
    content: item.content,
    timeText: formatLeadTime(item.created_at),
    authorText: item.created_by_name ? ` · ${item.created_by_name}` : "",
  };
}

/** hero 文案：进行中状态按模块取，终态与模块无关. */
export function heroCopy(status: UnifiedLeadStatus, module: GrowthModule): HeroCopy {
  const active = HERO_ACTIVE_COPY[status as "new" | "contacted" | "high_intent"];
  if (active) {
    return active[module];
  }
  return HERO_TERMINAL_COPY[status as "converted" | "eliminated"] ?? HERO_TERMINAL_COPY.eliminated;
}

/** 业务信息栅格（按模块差异化，缺失值「—」）. */
export function buildInfoItems(module: GrowthModule, d: CustomerDetail): InfoItem[] {
  const layoutArea = [d.layout, d.area != null ? `${d.area}㎡` : ""].filter(Boolean).join(" · ") || DASH;
  const source = (d.source && SOURCE_LABELS[d.source]) || DASH;
  const owner = d.employee_name ? `${d.employee_name}（我）` : "我";
  const common: InfoItem[] = [
    { k: "来源", v: source },
    { k: "归属员工", v: owner },
  ];
  if (module === "valuation") {
    return [
      { k: "小区", v: d.community_name || DASH },
      { k: "户型 / 面积", v: layoutArea, num: true },
      { k: "预期价", v: d.expected_price != null ? `${d.expected_price} 万` : DASH, num: true },
      {
        k: "评估价",
        v: d.eval_price != null ? `${d.eval_price} 万` : "待评估",
        mut: d.eval_price == null,
        num: true,
      },
      ...common,
    ];
  }
  if (module === "booking") {
    return [
      { k: "房源标题", v: d.property_title || DASH },
      { k: "预约时间", v: d.booking_time ? formatLeadTime(d.booking_time) : DASH, num: true },
      ...common,
    ];
  }
  if (module === "sheet") {
    return [
      { k: "分享短码", v: d.sheet_code || DASH, num: true },
      { k: "小区", v: d.community_name || DASH },
      { k: "户型 / 面积", v: layoutArea, num: true },
      { k: "预期价", v: d.expected_price != null ? `${d.expected_price} 万` : DASH, num: true },
      ...common,
    ];
  }
  return [
    { k: "主营商圈", v: d.main_business_area || DASH },
    { k: "来源活动", v: d.campaign_name || DASH },
    ...common,
  ];
}

/** 归因时间线（未发生节点灰点、无时间行）. */
export function buildTimeline(d: CustomerDetail): TimelineDisplay[] {
  return (d.timeline || []).map((ev, idx) => ({
    idx,
    text: timelineText(ev),
    timeText: ev.occurred && ev.occurred_at ? formatLeadTime(ev.occurred_at) : "",
    dim: !ev.occurred,
  }));
}

/** 4 节点进度条：当前节点 done cur、之前 done、之后默认；eliminated 走旁路全默认. */
export function buildFlowNodes(status: UnifiedLeadStatus): FlowNodeDisplay[] {
  const curIdx = FLOW_NODES.findIndex((n) => n.status === status);
  return FLOW_NODES.map((n, i) => ({
    num: i + 1,
    label: n.label,
    cls: curIdx < 0 ? "" : i < curIdx ? "done" : i === curIdx ? "done cur" : "",
  }));
}

/** 操作按钮按模块流转矩阵生成（booking 由 wxml 分支单独提示，不进此分支）. */
export function buildFlowActions(status: UnifiedLeadStatus, module: GrowthModule): FlowActionDisplay[] {
  const targets = FLOW_MATRIX[module][status];
  return targets.map((target, i) => ({
    status: target,
    label: `标记${STATUS_META[target].text}`,
    // 仅剩淘汰旁路一个按钮（valuation/sheet）时用 ghost 淘汰样式，主链路首位仍 btn-ink
    cls: targets.length === 1 ? "btn-ghost" : i === 0 ? "btn-ink" : i === 1 ? "btn-warm" : "btn-ghost",
  }));
}

/** 面板选项 = 当前模块矩阵允许的目标状态（含推荐 tag；valuation/sheet 仅淘汰项无推荐）. */
export function buildFlowOptions(status: UnifiedLeadStatus, module: GrowthModule): FlowOptionDisplay[] {
  const recommended = RECOMMENDED_NEXT[status];
  return FLOW_MATRIX[module][status].map((target) => ({
    status: target,
    label: STATUS_META[target].text,
    desc: FLOW_OPTION_DESC[target as Exclude<UnifiedLeadStatus, "new">],
    recommended: target === recommended,
    stgClass: STATUS_META[target].cls,
  }));
}
