/**
 * 估价授权价提醒 · 订阅消息逻辑（客户侧）.
 *
 * 员工「授权评估价 / 调整评估价」后由后端向客户推送订阅消息；
 * 本模块负责模板 ID 获取与一次性订阅授权（对齐 recruit-employee.ts 模式）：
 * - 模板 ID 由后端配置经 /public/valuations/subscribe-template 下发（空=功能关闭）
 * - 授权必须在用户 tap 手势回调内同步发起（wx.requestSubscribeMessage 限制）
 */

import type { components } from "../types/api-types";
import { request } from "./request";

type SubscribeTemplateResponse = components["schemas"]["PublicValuationSubscribeTemplateResponse"];

/**
 * 获取「授权价提醒」订阅消息模板 ID.
 * 后端未配置（null）或请求失败时返回 null，调用方据此跳过/隐藏授权入口.
 */
export async function fetchValuationSubscribeTemplate(): Promise<string | null> {
  try {
    const res = await request<SubscribeTemplateResponse>({
      url: "/public/valuations/subscribe-template",
      skipAuth: true,
    });
    return res.subscribe_template_id || null;
  } catch {
    return null;
  }
}

/** 订阅授权结果状态（对齐微信 requestSubscribeMessage 单模板返回值）. */
export type ValuationSubscribeStatus = "accept" | "reject" | "ban" | "filter" | "error";

/**
 * 发起「授权价提醒」订阅消息授权.
 * ⚠️ 必须在用户 tap 手势回调内同步调用（不可包 async/await 之后再调），
 * 接口失败/用户拒绝均静默，不阻断提交流程.
 *
 * 结果反馈（一次性订阅模型，每次「允许」仅可收 1 条消息）：
 * - accept：toast 正向确认「已开启调价提醒」
 * - ban：用户曾勾选「总是拒绝」，弹窗不再出现，引导去设置页开启「订阅消息」
 * - reject/filter/error：静默
 *
 * @param templateId 后端下发的 subscribe_template_id（空则跳过）
 */
export function requestValuationPriceSubscribe(
  templateId: string | null | undefined,
  onResult?: (status: ValuationSubscribeStatus) => void,
): void {
  if (!templateId) {
    return;
  }
  wx.requestSubscribeMessage({
    tmplIds: [templateId],
    success: (res) => {
      const status = (res[templateId] as ValuationSubscribeStatus | undefined) ?? "filter";
      if (status === "accept") {
        wx.showToast({ title: "已开启调价提醒", icon: "success" });
      } else if (status === "ban") {
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
      onResult?.(status);
    },
    fail: () => {
      onResult?.("error");
    },
  });
}
