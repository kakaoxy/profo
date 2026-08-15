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

/**
 * 发起「新线索提醒」订阅消息授权.
 * ⚠️ 必须在用户 tap 手势回调内同步调用（不可包 async/await 之后再调），
 * 用户拒绝/接口失败均静默，不阻断分享/海报流程。
 * @param templateId 活动详情返回的 subscribe_template_id（空则跳过）
 */
export function requestLeadSubscribe(templateId: string | null | undefined): void {
  if (!templateId) {
    return;
  }
  wx.requestSubscribeMessage({
    tmplIds: [templateId],
    complete: () => {
      // 拒绝/失败静默
    },
  });
}
