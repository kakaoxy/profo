/**
 * 消息中心共享类型与展示常量（中立模块）
 *
 * 放在 `src/components/notifications/` 而非 `(main)/admin/notifications/_lib`：
 * 侧边栏铃铛（`src/components/app-sidebar.tsx` 消费）与消息中心页都要用同一套
 * 类型与分类常量，共享组件不得反向依赖 app 路由的私有目录。
 */

import type { components } from "@/lib/api-types";

export type NotificationListResponse = components["schemas"]["NotificationListResponse"];
export type NotificationListItem = components["schemas"]["NotificationListItem"];
export type NotificationDeliverySnapshot =
  components["schemas"]["NotificationDeliverySnapshot"];
export type UnreadCountResponse = components["schemas"]["UnreadCountResponse"];
export type NotificationPreferencesResponse =
  components["schemas"]["NotificationPreferencesResponse"];
export type PreferenceCategory = components["schemas"]["PreferenceCategory"];

/** 分类 → 中文名（与后端 CATEGORY_META.label 一致） */
export const CATEGORY_LABELS: Record<string, string> = {
  lead: "线索",
  growth: "获客",
  project: "项目",
  key: "房源分享",
  marketing: "营销",
  finance: "资金",
  system: "系统",
  security: "安全",
};

/** 抽屉/消息中心 tabs 展示的分类（其余分类仅在偏好页出现） */
export const DISPLAY_CATEGORIES = ["lead", "growth", "project", "security"] as const;

/** 相对时间（「8 分钟前」「昨天 18:20」），仅用于展示 */
export function formatRelativeTime(iso: string): string {
  const target = new Date(iso);
  const now = new Date();
  const diffMinutes = Math.floor((now.getTime() - target.getTime()) / 60000);
  if (diffMinutes < 1) return "刚刚";
  if (diffMinutes < 60) return `${diffMinutes} 分钟前`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24 && now.getDate() === target.getDate()) return `${diffHours} 小时前`;
  const hh = String(target.getHours()).padStart(2, "0");
  const mm = String(target.getMinutes()).padStart(2, "0");
  if (diffHours < 48) return `昨天 ${hh}:${mm}`;
  const mo = String(target.getMonth() + 1).padStart(2, "0");
  const day = String(target.getDate()).padStart(2, "0");
  return `${mo}-${day} ${hh}:${mm}`;
}
