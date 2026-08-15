/**
 * 区域伙伴招募计划 · 员工侧逻辑（招募计划二期）.
 *
 * 从详情页抽出的员工侧取数与订阅授权，保持页面精简：
 * - 员工身份 + 未读新线索角标（角标改经 /public/recruit/my/leads 取 total，失败静默）
 * - 订阅消息授权（必须在用户 tap 手势内同步发起，故导出为可直调的同步函数）
 */

import type { components } from "../types/api-types";
import { request } from "./request";

type UserResponse = components["schemas"]["UserResponse"];
type RecruitMyLeadListResponse = components["schemas"]["RecruitMyLeadListResponse"];

/** 员工识别 + 角标取数结果. */
export interface EmployeeIdentity {
  employeeId: string;
  /** 未读新线索数（取数失败为 0，静默降级）. */
  badgeCount: number;
}

/**
 * 识别当前登录员工并读取未读新线索角标.
 * - /auth/me 失败（401/403/网络）→ reject，由调用方静默处理（员工可正常浏览/分享）
 * - 角标取数失败 → 静默置 0，不阻断员工识别
 */
export async function fetchEmployeeIdentity(): Promise<EmployeeIdentity> {
  const me = await request<UserResponse>({ url: "/auth/me" });
  const employeeId = me.id;
  let badgeCount = 0;
  try {
    const res = await request<RecruitMyLeadListResponse>({
      url: "/public/recruit/my/leads?status=new&page=1&page_size=1",
    });
    badgeCount = res.total || 0;
  } catch {
    // 角标取数失败静默（C 端身份缺失/网络异常等），不阻断员工识别
  }
  return { employeeId, badgeCount };
}

/** 订阅授权结果状态（对齐微信 requestSubscribeMessage 单模板返回值）. */
export type LeadSubscribeStatus = "accept" | "reject" | "ban" | "filter" | "error";

/** 订阅授权结果回调参数. */
export interface LeadSubscribeResult {
  status: LeadSubscribeStatus;
}

/**
 * 发起「新线索提醒」订阅消息授权.
 * ⚠️ 必须在用户 tap 手势回调内同步调用（不可包 async/await 之后再调），
 * 接口失败/用户拒绝均静默，不阻断分享/海报流程.
 *
 * 结果反馈（一次性订阅模型，每次「允许」仅可收 1 条消息）：
 * - accept：toast 正向确认「已开启新线索提醒」
 * - ban：用户曾勾选「总是拒绝」，弹窗不再出现，引导去设置页开启「订阅消息」
 * - reject/filter/error：静默
 *
 * @param templateId 活动详情返回的 subscribe_template_id（空则跳过）
 * @param onResult 授权结果回调（可选，供调用方按状态更新 UI，如隐藏提示条）
 */
export function requestLeadSubscribe(
  templateId: string | null | undefined,
  onResult?: (result: LeadSubscribeResult) => void,
): void {
  if (!templateId) {
    return;
  }
  wx.requestSubscribeMessage({
    tmplIds: [templateId],
    success: (res) => {
      const status = (res[templateId] as LeadSubscribeStatus | undefined) ?? "filter";
      if (status === "accept") {
        wx.showToast({ title: "已开启新线索提醒", icon: "success" });
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
      onResult?.({ status });
    },
    fail: () => {
      onResult?.({ status: "error" });
    },
  });
}
