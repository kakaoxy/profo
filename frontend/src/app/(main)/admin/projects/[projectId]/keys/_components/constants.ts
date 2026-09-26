import type { components } from "@/lib/api-types";

/** 钥匙管理页共用类型别名与展示常量（Task 6，类型一律来自生成的 api-types，禁手写） */

export type KeysDetailResponse = components["schemas"]["KeysDetailResponse"];
export type ManagerKeyResponse = components["schemas"]["ManagerKeyResponse"];
export type NormalKeyItem = components["schemas"]["NormalKeyItem"];
export type GeneratedNormalKeyItem = components["schemas"]["GeneratedNormalKeyItem"];
export type NormalKeyGenerateResponse = components["schemas"]["NormalKeyGenerateResponse"];
export type KeyLogItem = components["schemas"]["KeyLogItem"];
export type KeyRevealResponse = components["schemas"]["KeyRevealResponse"];
export type NormalKeyBatchDeleteResponse = components["schemas"]["NormalKeyBatchDeleteResponse"];

export type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

/** 密码掩码占位（默认不显密文） */
export const MASKED_PASSWORD = "••••••";

/** 明文揭示后自动回到掩码态的时长 */
export const REVEAL_AUTO_HIDE_MS = 5000;

/** 手动批量录入上限（组） */
export const MAX_BATCH_ENTRY = 20;

/** 随机生成组数可选项 */
export const GENERATE_COUNT_OPTIONS = [5, 6, 8, 10] as const;

/** 普通密码组状态 → 中文标签 + Badge 变体（active=有效 / pending_entry=待录入 / disabled=已停用） */
export const NORMAL_KEY_STATUS_META: Record<string, { label: string; variant: BadgeVariant }> = {
  active: { label: "有效", variant: "secondary" },
  pending_entry: { label: "待录入", variant: "outline" },
  disabled: { label: "已停用", variant: "destructive" },
};

/** 操作日志动作 → 中文标签 + Badge 变体 */
export const KEY_LOG_ACTION_META: Record<string, { label: string; variant: BadgeVariant }> = {
  create: { label: "录入", variant: "default" },
  generate: { label: "系统生成", variant: "default" },
  regenerate: { label: "换一批", variant: "secondary" },
  confirm: { label: "标记已录入", variant: "default" },
  view: { label: "查看明文", variant: "secondary" },
  update: { label: "修改", variant: "secondary" },
  disable: { label: "停用", variant: "destructive" },
  delete: { label: "删除", variant: "destructive" },
  share_create: { label: "生成分享", variant: "default" },
  share_revoke: { label: "回收分享", variant: "destructive" },
  share_extend: { label: "延长有效期", variant: "outline" },
  share_expire: { label: "分享过期", variant: "destructive" },
  open_share: { label: "打开分享页", variant: "outline" },
  agent_view: { label: "经纪人查看密码", variant: "secondary" },
};

/** 操作日志操作者类型 → 中文标签 + Badge 变体 */
export const KEY_LOG_ACTOR_META: Record<string, { label: string; variant: BadgeVariant }> = {
  user: { label: "员工", variant: "secondary" },
  agent: { label: "经纪人", variant: "outline" },
  system: { label: "系统", variant: "default" },
};

/** openapi-fetch 错误体（后端统一 {code,message}）→ message；取不到时用 fallback */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  const message = (error as { message?: string } | null | undefined)?.message;
  return typeof message === "string" && message ? message : fallback;
}

/**
 * 操作日志对象摘要：
 * - detail.object → 「管理密码」/「普通密码」（普通密码尽量用 keySeqById 对照出「· #seq」，已删除降级）
 * - detail.count → 「×n」
 * - project 级分享事件（detail.share_id 存在且 action 为 share_*）→ token 前 8 位
 */
export function keyLogSummary(log: KeyLogItem, keySeqById?: Map<string, number>): string | null {
  const detail = log.detail ?? {};
  const parts: string[] = [];

  const object = detail["object"];
  if (object === "manager") {
    parts.push("管理密码");
  } else if (object === "normal") {
    const keyId = detail["key_id"];
    const seq = typeof keyId === "string" ? keySeqById?.get(keyId) : undefined;
    parts.push(seq !== undefined ? `普通密码 · #${seq}` : "普通密码");
  }

  const count = detail["count"];
  if (typeof count === "number" && count > 0) {
    parts.push(`×${count}`);
  }

  const shareId = detail["share_id"];
  const token = detail["token"];
  if (
    typeof shareId === "string" &&
    shareId &&
    log.action.startsWith("share_") &&
    typeof token === "string" &&
    token
  ) {
    parts.push(token.slice(0, 8));
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}
