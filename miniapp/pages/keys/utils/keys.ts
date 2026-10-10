/**
 * 钥匙管理员工端共用工具（pages/keys 下 9 个页面复用）.
 *
 * 提供四类能力，避免各页重复实现：
 * - API 类型别名（统一从 types/api-types 取，禁止手写）；
 * - 日期/时间格式化（东八区口径，设计稿全部为 MM.DD / HH:mm 展示）；
 * - 状态文案映射（项目状态 / 普通密码组状态 / 分享状态）；
 * - 后端错误文案提取（{"code":≠0,"message":"..."}）.
 */
import type { components } from "../../../types/api-types";
import { pad2 } from "../../../utils/format";
import type { HttpResponseError } from "../../../utils/request";

export type KeysPropertiesResponse = components["schemas"]["KeysPropertiesResponse"];
export type KeysPropertyItem = components["schemas"]["KeysPropertyItem"];
export type KeysSummaryResponse = components["schemas"]["KeysSummaryResponse"];
export type KeysDetailResponse = components["schemas"]["KeysDetailResponse"];
export type ManagerKeyResponse = components["schemas"]["ManagerKeyResponse"];
export type NormalKeyItem = components["schemas"]["NormalKeyItem"];
export type GeneratedNormalKeyItem = components["schemas"]["GeneratedNormalKeyItem"];
export type NormalKeyGenerateResponse = components["schemas"]["NormalKeyGenerateResponse"];
export type NormalKeyCounts = components["schemas"]["NormalKeyCounts"];
export type KeyRevealResponse = components["schemas"]["KeyRevealResponse"];
export type KeyShareListItem = components["schemas"]["KeyShareListItem"];
export type KeyShareListResponse = components["schemas"]["KeyShareListResponse"];
export type KeyShareDetailResponse = components["schemas"]["KeyShareDetailResponse"];
export type KeyShareDetailItem = components["schemas"]["KeyShareDetailItem"];
export type KeyShareTimelineItem = components["schemas"]["KeyShareTimelineItem"];
export type KeyShareCreatedResponse = components["schemas"]["KeyShareCreatedResponse"];
export type KeyShareActionResponse = components["schemas"]["KeyShareActionResponse"];
export type NormalKeyBatchDeleteResponse = components["schemas"]["NormalKeyBatchDeleteResponse"];

/**
 * 分享流程跨页地址快照 storage key（share/properties 写入 → share/keys 读取后清除）。
 * 放本工具模块而非页面模块，避免页面间 import 导致 Page() 重复注册.
 */
export const SHARE_PROPS_STORAGE_KEY = "keys_share_props";

/**
 * 置顶排序 storage key 前缀（share/keys 分享成功时按令牌写入 → keys/list 读取置顶排序）。
 * 与后端 list_my_properties 的「最近一次分享置顶」口径一致，双保险防 SWR 缓存回序.
 */
export const RECENT_SHARED_KEY_PREFIX = "keys_recent_shared_projects";

/** 普通密码组状态 → 中文文案. */
export const NORMAL_KEY_STATUS_TEXT: Record<string, string> = {
  active: "有效",
  pending_entry: "待录入",
  disabled: "已停用",
};

/** 项目状态 → 中文文案（对齐设计稿 C2：在售中 / 装修中 / 已签约）. */
export const PROJECT_STATUS_TEXT: Record<string, string> = {
  signing: "已签约",
  renovating: "装修中",
  selling: "在售中",
  sold: "已售",
  ended: "已结束",
  deleted: "已删除",
};

/** ISO 时间 → Date；不可解析返回 null. */
function toDate(iso: string | null | undefined): Date | null {
  if (!iso) {
    return null;
  }
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO 时间 → YYYY.MM.DD（本地时区）；非法返回 "—". */
export function formatDay(iso: string | null | undefined): string {
  const d = toDate(iso);
  if (!d) {
    return "—";
  }
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
}

/** ISO 时间 → HH:mm（本地时区）；非法返回 "—". */
export function formatHM(iso: string | null | undefined): string {
  const d = toDate(iso);
  if (!d) {
    return "—";
  }
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** ISO 时间 → MM.DD HH:mm（本地时区）；非法返回 "—". */
export function formatStamp(iso: string | null | undefined): string {
  const d = toDate(iso);
  if (!d) {
    return "—";
  }
  return `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} ${formatHM(iso)}`;
}

/** 东八区今日 → YYYY-MM-DD（picker mode=date 的 value 格式）. */
export function todayBeijing(): string {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

/** 东八区今日 → YYYY.MM.DD（展示用）. */
export function todayBeijingDot(): string {
  return todayBeijing().replace(/-/g, ".");
}

/**
 * 有效期 chip「至 MM.DD」文案（自然日口径）：第 N 个自然日的 MM.DD（东八区）。
 * 当日为第 1 天：N=1 即今日（后端到期于当日 23:59:59），N=7 为今日+6 天.
 */
export function expireDotOfDay(days: number): string {
  const d = new Date(Date.now() + 8 * 3600 * 1000 + (days - 1) * 24 * 3600 * 1000);
  return `${pad2(d.getUTCMonth() + 1)}.${pad2(d.getUTCDate())}`;
}

/**
 * 分享有效期展示：剩余整天数（向上取整，未过期 ≥1）；参数为空/已过期返回 0.
 */
export function remainingDays(expiresAt: string | null | undefined): number {
  const d = toDate(expiresAt);
  if (!d) {
    return 0;
  }
  const ms = d.getTime() - Date.now();
  if (ms <= 0) {
    return 0;
  }
  return Math.ceil(ms / (24 * 3600 * 1000));
}

/**
 * 分享状态归一：revoked=已回收（硬失效）；is_expired=已过期（同样不可查看，延长有效期可恢复）；
 * 其余=active 进行中。与后端 status / is_expired 字段对齐.
 */
export function shareStatusOf(status: string, isExpired: boolean): "active" | "expired" | "revoked" {
  if (status === "revoked") {
    return "revoked";
  }
  if (status === "expired" || isExpired) {
    return "expired";
  }
  return "active";
}

/**
 * 分享记录卡标题：小区名用「/」拼接；全部为空回退「N 套房源」。
 * 超出 maxLen 时保留能容纳的前几个小区名，并以「…」收尾.
 */
export function shareCardTitle(names: string[], itemsCount: number, maxLen = 12): string {
  const cleaned = names.map((n) => n.trim()).filter(Boolean);
  if (cleaned.length === 0) {
    return `${itemsCount} 套房源`;
  }
  const parts: string[] = [];
  let len = 0;
  for (const name of cleaned) {
    const extra = (parts.length > 0 ? 1 : 0) + name.length;
    if (parts.length > 0 && len + extra > maxLen) {
      break;
    }
    parts.push(name);
    len += extra;
  }
  const joined = parts.join("/");
  const overflow = parts.length < cleaned.length || joined.length > maxLen;
  return overflow ? `${joined.slice(0, maxLen)}…` : joined;
}

/** 按置顶 ID 集稳定排序：置顶项在前（保持原相对顺序），其余在后（保持原相对顺序）. */
export function stablePartition<T>(list: T[], topIds: Set<string>, keyOf: (item: T) => string): T[] {
  const top = list.filter((item) => topIds.has(keyOf(item)));
  const rest = list.filter((item) => !topIds.has(keyOf(item)));
  return [...top, ...rest];
}

/** 查看记录动作 → 中文文案. */
export const TIMELINE_ACTION_TEXT: Record<string, string> = {
  share_create: "生成分享",
  open_share: "打开分享页",
  agent_view: "查看了密码",
  share_revoke: "回收分享",
  share_extend: "延长有效期",
  share_expire: "分享过期",
};

/** 从错误响应体提取后端 message（{"code":≠0,"message":"..."}），无则返回空串. */
export function extractErrorMessage(err: unknown): string {
  const body = (err as HttpResponseError | undefined)?.body;
  if (body && typeof body === "object" && "message" in body) {
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string" && message) {
      return message;
    }
  }
  return "";
}
