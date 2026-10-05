/**
 * 房源动态提醒 · 订阅消息逻辑（C 端房源列表页）.
 *
 * 后端「创建即发布 / 草稿转发布（上新）」与「已发布房源调价」后，
 * 向所有剩余额度 > 0 的订阅用户推送微信订阅消息（频道型公共通知）；
 * 本模块负责模板 ID 获取、订阅授权与结果上报（对齐 valuation-notify.ts 模式）：
 * - 模板 ID 由后端配置经 /public/marketing/subscribe-template 下发（均未配置 = 功能关闭）
 * - 授权必须在用户 tap 手势回调内同步发起（wx.requestSubscribeMessage 限制）
 * - 授权 accept 结果上报 /public/marketing/subscriptions/report，按模板累计额度
 *   （需 C 端登录态；未登录时上报 401 失败静默返回 null，由调用方引导登录后补报）
 */

import type { components } from "../types/api-types";
import { getCAccessToken } from "./token";
import { request } from "./request";

type SubscribeTemplateResponse =
  components["schemas"]["PublicMarketingSubscribeTemplateResponse"];
type SubscriptionStatusResponse =
  components["schemas"]["PublicMarketingSubscriptionStatusResponse"];
type SubscribeReportResponse = components["schemas"]["PublicMarketingSubscribeReportResponse"];

/** 订阅模板 ID 对（任一为 null 表示该频道不可订阅）. */
export interface MarketingSubscribeTemplates {
  newListingTemplateId: string | null;
  priceChangeTemplateId: string | null;
}

/** 订阅额度状态. */
export interface MarketingSubscriptionStatus {
  newListingQuota: number;
  priceChangeQuota: number;
  lastSubscribedAt: string | null;
}

/** 订阅授权结果状态（对齐微信 requestSubscribeMessage 单模板返回值）. */
export type MarketingSubscribeStatus = "accept" | "reject" | "ban" | "filter" | "error";

/**
 * 获取「房源动态提醒」订阅消息模板 ID 对.
 * 功能关闭（subscribe_enabled=false）或请求失败时返回 null，调用方据此隐藏订阅入口.
 */
export async function fetchMarketingSubscribeTemplates(): Promise<MarketingSubscribeTemplates | null> {
  try {
    const res = await request<SubscribeTemplateResponse>({
      url: "/public/marketing/subscribe-template",
      skipAuth: true,
    });
    if (!res.subscribe_enabled) {
      return null;
    }
    return {
      newListingTemplateId: res.new_listing_template_id || null,
      priceChangeTemplateId: res.price_change_template_id || null,
    };
  } catch {
    return null;
  }
}

/**
 * 查询当前用户订阅额度状态（需登录；未登录/失败返回 null）.
 */
export async function fetchMarketingSubscriptionStatus(): Promise<MarketingSubscriptionStatus | null> {
  // 未登录：status 接口需 C 端登录态，直接不发请求（避免 401 噪音）
  if (!getCAccessToken()) {
    return null;
  }
  try {
    const res = await request<SubscriptionStatusResponse>({
      url: "/public/marketing/subscriptions/status",
    });
    return {
      newListingQuota: res.new_listing_quota,
      priceChangeQuota: res.price_change_quota,
      lastSubscribedAt: res.last_subscribed_at || null,
    };
  } catch {
    return null;
  }
}

/** 上报授权结果（内部；未登录或失败均静默返回 null，调用方据 onResult 引导登录）. */
async function reportSubscribeResult(
  results: { templateId: string; status: MarketingSubscribeStatus }[],
): Promise<MarketingSubscriptionStatus | null> {
  // 未登录：report 接口需 C 端登录态，直接不发请求（避免 401 噪音），
  // 由调用方 onResult(status="accept", quotas=null) 分支引导登录后补报
  if (!getCAccessToken()) {
    return null;
  }
  try {
    const res = await request<SubscribeReportResponse>({
      url: "/public/marketing/subscriptions/report",
      method: "POST",
      data: {
        results: results.map((r) => ({ template_id: r.templateId, status: r.status })),
      },
    });
    return {
      newListingQuota: res.new_listing_quota,
      priceChangeQuota: res.price_change_quota,
      lastSubscribedAt: null,
    };
  } catch {
    return null;
  }
}

/**
 * 发起「房源动态提醒」订阅消息授权.
 * ⚠️ 必须在用户 tap 手势回调内同步调用（不可包 async/await 之后再调），
 * 对齐 valuation-notify.ts 约束.
 *
 * 两频道一次拉起（模板任一为空则只请求有效那个）；结果逐条上报后端累计额度：
 * - accept：toast 正向确认「已开启提醒」
 * - ban：用户曾勾选「总是拒绝」，弹窗引导去设置页开启「订阅消息」
 * - reject/filter/error：静默
 *
 * @param templates 后端下发的模板 ID 对
 * @param onResult 授权流程结束回调（带最新额度状态，上报失败时为 null）
 */
export function requestMarketingSubscribe(
  templates: MarketingSubscribeTemplates,
  onResult?: (status: MarketingSubscribeStatus, quotas: MarketingSubscriptionStatus | null) => void,
): void {
  const tmplIds = [templates.newListingTemplateId, templates.priceChangeTemplateId].filter(
    (id): id is string => !!id,
  );
  if (tmplIds.length === 0) {
    return;
  }
  wx.requestSubscribeMessage({
    tmplIds,
    success: (res) => {
      // 逐模板收集结果（上报仅 accept 计数，其余状态上报留痕亦可，但保持轻量仅上报 accept/ban）
      const results: { templateId: string; status: MarketingSubscribeStatus }[] = [];
      let finalStatus: MarketingSubscribeStatus = "error";
      for (const id of tmplIds) {
        const status = (res[id] as MarketingSubscribeStatus | undefined) ?? "filter";
        if (status === "accept" || status === "ban") {
          results.push({ templateId: id, status });
        }
        if (status === "accept") {
          finalStatus = "accept";
        } else if (status === "ban" && finalStatus !== "accept") {
          finalStatus = "ban";
        }
      }

      const finish = (quotas: MarketingSubscriptionStatus | null) => {
        if (finalStatus === "accept") {
          wx.showToast({ title: "已开启提醒", icon: "success" });
        } else if (finalStatus === "ban") {
          wx.showModal({
            title: "无法开启提醒",
            content: "您此前选择了总是拒收订阅消息，请在设置中开启「订阅消息」后重试",
            confirmText: "去设置",
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.openSetting({});
              }
            },
          });
        }
        onResult?.(finalStatus, quotas);
      };

      if (results.length > 0) {
        reportSubscribeResult(results).then(finish);
      } else {
        finish(null);
      }
    },
    fail: () => {
      onResult?.("error", null);
    },
  });
}
