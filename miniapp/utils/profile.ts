import { request } from "./request";

/** PUT /public/users/wechat-profile 请求体（与后端 WechatProfileUpdateRequest 对齐）.
 *
 * nickname 与 avatar_url 均可选，但至少一个非空（后端 Schema 层强制）：
 * - 仅传 nickname：派生 username 并更新 nickname（用于昵称独立授权）
 * - 仅传 avatar_url：仅更新 avatar（用于头像独立授权）
 * - 同时传：两者都更新
 */
export interface WechatProfileUpdatePayload {
  nickname?: string;
  avatar_url?: string;
}

/** C 端用户资料响应（与后端 PublicUserProfileResponse 对齐，仅取必要字段）. */
export interface WechatProfileUpdateResponse {
  id: string;
  username: string;
  nickname: string | null;
  phone: string | null;
  avatar: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * 调用 PUT /public/users/wechat-profile 完善微信资料.
 *
 * 由后端根据 nickname 派生 username（冲突时自动加 6 位 hex 后缀），
 * 前端无需感知 username 生成策略。
 */
export function updateWechatProfile(
  payload: WechatProfileUpdatePayload,
): Promise<WechatProfileUpdateResponse> {
  return request<WechatProfileUpdateResponse>({
    url: "/public/users/wechat-profile",
    method: "PUT",
    data: payload,
  });
}
