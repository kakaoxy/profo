/**
 * 估价分享归因 · 纯逻辑工具.
 *
 * 抽离估价提交页中不依赖微信运行时（wx.*）的纯函数，便于 vitest 直测：
 * - 分享/进入参数解析（referrer）
 * - 分享 path 构造（referrer + source=card）
 * - 分享标题常量（对照设计稿 valuation-share-entry.html 分享卡片）
 * - 员工身份识别（/auth/me，失败 reject 供页面静默降级）
 */

import type { components } from "../types/api-types";
import { request } from "./request";

type UserResponse = components["schemas"]["UserResponse"];

/** 估价分享/进入参数解析结果. */
export interface ValuationQuery {
  /** 分享归属员工 ID；空串=无归属（游客直接进入/未透传）. */
  referrer: string;
}

/** 分享卡片标题/图片（与 about 服务页分享卡片一致，保证分享内容统一）. */
export const VALUATION_SHARE_TITLE = "零现金焕新，全流程托管，点击了解您的房价";
export const VALUATION_SHARE_IMAGE = "/assets/share.jpg";

/**
 * 解析 onLoad 分享/进入参数.
 * 仅取 referrer（分享归属员工 ID），source 由 buildValuationSharePath 固定为 card.
 */
export function parseValuationQuery(
  options: Record<string, string | undefined>,
): ValuationQuery {
  return { referrer: options.referrer || "" };
}

/**
 * 构建估价分享 path（卡片 path 与朋友圈 query 共用前缀）.
 * referrer 为空时省略该参数（直接分享无归属，不携带 referrer）.
 */
export function buildValuationSharePath(referrer: string): string {
  const params: string[] = [];
  if (referrer) {
    params.push(`referrer=${encodeURIComponent(referrer)}`);
  }
  params.push("source=card");
  return `/pages/valuation/submit/index?${params.join("&")}`;
}

/**
 * 识别当前登录员工 ID（/auth/me，admin 令牌）.
 * 失败（401/403/网络）→ reject，由调用方静默处理（非员工不显示横幅）.
 */
export async function fetchEmployeeId(): Promise<string> {
  const me = await request<UserResponse>({ url: "/auth/me" });
  return me.id;
}
