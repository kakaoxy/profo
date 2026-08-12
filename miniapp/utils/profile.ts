import type { components } from "../types/api-types";
import { request } from "./request";

type WechatProfileUpdateRequest = components["schemas"]["WechatProfileUpdateRequest"];
type PublicUserProfileResponse = components["schemas"]["PublicUserProfileResponse"];

/**
 * 调用 PUT /public/users/wechat-profile 完善微信资料.
 *
 * nickname 与 avatar_url 均可选，但至少一个非空（后端 Schema 层强制）：
 * - 仅传 nickname：派生 username 并更新 nickname（用于昵称独立授权）
 * - 仅传 avatar_url：仅更新 avatar（用于头像独立授权）
 * - 同时传：两者都更新
 *
 * 由后端根据 nickname 派生 username（冲突时自动加 6 位 hex 后缀），
 * 前端无需感知 username 生成策略。
 */
export function updateWechatProfile(
  payload: WechatProfileUpdateRequest,
): Promise<PublicUserProfileResponse> {
  return request<PublicUserProfileResponse>({
    url: "/public/users/wechat-profile",
    method: "PUT",
    data: payload,
  });
}
