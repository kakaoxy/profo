"use client";

import { useCUser } from "./user-context";

export interface UserInfo {
  nickname: string | null;
  phone: string | null;
}

const EMPTY_INFO: UserInfo = { nickname: null, phone: null };

/**
 * 读取当前 C 端登录用户信息。
 * 数据来自 (c)/layout.tsx 在服务端调用 GET /public/auth/me 获取并经
 * CUserProvider 注入的 Context，避免客户端读取 c_user_info cookie 引发
 * 的 hydration 不一致与 cookie 寿命不同步问题。
 */
export function useUserInfo(): UserInfo {
  const user = useCUser();
  if (!user) return EMPTY_INFO;
  return { nickname: user.nickname, phone: user.phone };
}
