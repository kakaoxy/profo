import type { components, paths } from "@/lib/api-types";
import { PROJECT_SECTION_IDS } from "../../[projectId]/_components/page-shell/config";

/** 看板响应（/api/v1/projects/todo-board，规则引擎实时快照） */
export type TodoBoardResponse =
  paths["/api/v1/projects/todo-board"]["get"]["responses"][200]["content"]["application/json"];

/** 规则配置响应（/api/v1/projects/todo-board/config，含 updated_* 元信息与出厂默认值） */
export type TodoBoardConfigResponse =
  paths["/api/v1/projects/todo-board/config"]["get"]["responses"][200]["content"]["application/json"];

export type TodoBoardRulesData = components["schemas"]["TodoBoardRulesData"];
/** Literal 别名被 openapi 内联为字面量联合，本地等价定义（与后端 TodoFieldLevel 对齐） */
export type TodoFieldLevel = "core" | "minor" | "off";
export type TodoProjectCardData = components["schemas"]["TodoProjectCard"];
export type TodoItemData = components["schemas"]["TodoItemOut"];
export type TodoPriority = TodoItemData["priority"];
export type TodoAnchor = TodoItemData["anchor"];

/** 步进器数值范围（与后端 Pydantic 校验 1~999 一致） */
export const RULE_DAYS_MIN = 1;
export const RULE_DAYS_MAX = 999;

/** 规则天数键（弹窗步进器行的 key，值 = TodoBoardRulesData 字段名） */
export type RuleDaysKey =
  | "milestone_p0_overdue_days"
  | "basic_info_grace_days"
  | "company_grace_days"
  | "start_grace_days"
  | "archive_overdue_days"
  | "commission_near_days"
  | "delivery_total_days"
  | "delivery_near_days"
  | "delivery_urgent_days";

/** 分组一 · 装修工序里程碑（展示顺序 = 后端 MILESTONE_STAGES） */
export const MILESTONE_ROWS: { stage: string; desc: string }[] = [
  { stage: "设计", desc: "设计稿完成" },
  { stage: "拆除", desc: "拆除完工" },
  { stage: "水电", desc: "水电完工" },
  { stage: "木瓦", desc: "木瓦完工" },
  { stage: "油漆", desc: "油漆完工" },
  { stage: "交付", desc: "竣工交付" },
];

/** 分组二 · 宽限与提醒窗口（每行一句话口径） */
export const GRACE_ROWS: { key: RuleDaysKey; name: string; desc: string }[] = [
  { key: "basic_info_grace_days", name: "基础信息缺失", desc: "签约后 N 天仍缺基础信息即提示（核心缺 → P1）" },
  { key: "company_grace_days", name: "未安排施工方", desc: "进入装修后 N 天仍未填施工方即提示（P0）" },
  { key: "start_grace_days", name: "未实际开工", desc: "进入装修后 N 天仍无开工记录；合同进场日已过 → P0" },
  { key: "milestone_p0_overdue_days", name: "里程碑逾期升 P0", desc: "工序里程碑逾期超过 N 天，由 P1 升 P0" },
  { key: "archive_overdue_days", name: "已签署未归档", desc: "签署后 N 天仍未归档，由 P2 升 P1" },
  { key: "commission_near_days", name: "委托期临近", desc: "委托期结束前 N 天进入「临近」提示（P1）" },
  { key: "delivery_total_days", name: "交付周期", desc: "详情页交付倒计时 = 约定交房日 + N 天（截止）" },
  { key: "delivery_near_days", name: "交付临近", desc: "交付倒计时剩余 ≤ N 天橙色提示" },
  { key: "delivery_urgent_days", name: "交付紧急", desc: "剩余 < N 天红色脉冲（判断优先于橙色）" },
];

/** 分组三 · 基础信息字段集展示顺序（= 后端 BASIC_INFO_FIELD_NAMES） */
export const R2_FIELD_ORDER = [
  "签约价",
  "业务形式",
  "交房时间",
  "业主联系方式",
  "面积",
  "户型",
  "朝向",
  "楼层信息",
  "水电户号",
  "水表户号",
  "燃气户号",
] as const;

/** 步进器天数收敛（NaN/越界 → 边界值） */
export function clampRuleDays(value: number): number {
  if (Number.isNaN(value)) return RULE_DAYS_MIN;
  return Math.min(RULE_DAYS_MAX, Math.max(RULE_DAYS_MIN, value));
}

/** 待办 anchor → 详情页分区元素 id（PROJECT_SECTION_IDS 的看板子集） */
export const ANCHOR_SECTION_ID: Record<TodoAnchor, string> = {
  overview: PROJECT_SECTION_IDS.overview,
  documents: PROJECT_SECTION_IDS.documents,
  renovation_contract: PROJECT_SECTION_IDS.renovationContract,
  renovation_progress: PROJECT_SECTION_IDS.renovation,
};

/** 待办 anchor → 分区中文名（弹窗左下角「→ 详情页 · {分区名}」） */
export const ANCHOR_LABEL: Record<TodoAnchor, string> = {
  overview: "概览",
  documents: "文书与附件",
  renovation_contract: "装修合同",
  renovation_progress: "装修进度",
};

/** 徽章公共底座（设计稿 .chip：11px / 480 / 胶囊） */
const CHIP_BASE = "inline-flex items-center rounded-full px-[9px] py-1 text-[11px] leading-none font-[480] whitespace-nowrap";

/** 阶段徽章（对齐 columns.tsx STEEP_STATUS_BADGE_CLASS） */
export const STAGE_CHIP_CLASS: Record<TodoProjectCardData["status"], string> = {
  signing: `${CHIP_BASE} bg-sky-wash text-ink`,
  renovating: `${CHIP_BASE} bg-apricot-wash text-rust`,
};

/** 优先级徽章（弹窗头部） */
export const PRIORITY_CHIP_CLASS: Record<TodoPriority, string> = {
  p0: `${CHIP_BASE} bg-rust font-mono text-pure-white`,
  p1: `${CHIP_BASE} bg-apricot-wash font-mono text-rust`,
  p2: `${CHIP_BASE} bg-[#eef0f3] font-mono text-[#6b6e76]`,
};

/** 卡头 P0 计数徽章（P0 ≥ 1 才渲染） */
export const P0_COUNT_CHIP_CLASS = `${CHIP_BASE} bg-rust font-mono text-[10.5px] text-pure-white`;

/** 优先级点（P0 实心 rust / P1 空心 rust 环 / P2 灰点） */
export const PRIORITY_DOT_CLASS: Record<TodoPriority, string> = {
  p0: "h-[9px] w-[9px] shrink-0 rounded-full bg-rust",
  p1: "h-[9px] w-[9px] shrink-0 rounded-full border-2 border-rust",
  p2: "h-[7px] w-[7px] shrink-0 rounded-full bg-dove",
};

/**
 * 规则快照时间格式化：ISO 字符串字面量截取「MM-DD HH:mm」。
 * 不经 Date 解析（后端已是本地时区 +offset），SSR/客户端渲染结果一致。
 */
export function formatSnapshotTime(iso: string): string {
  return `${iso.slice(5, 10)} ${iso.slice(11, 16)}`;
}
