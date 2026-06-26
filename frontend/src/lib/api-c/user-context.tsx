"use client";

import { createContext, useContext } from "react";

/**
 * C 端当前登录用户信息。
 * 由 Server Component 在 (c)/layout.tsx 调用 GET /public/auth/me 获取，
 * 通过 Context 注入给所有客户端子组件，避免客户端读 cookie 引发的
 * hydration 不一致与 cookie 寿命不同步问题。
 */
export interface CUser {
  id: string;
  username: string;
  nickname: string | null;
  phone: string | null;
  avatar: string | null;
}

const CUserContext = createContext<CUser | null>(null);

export function CUserProvider({
  user,
  children,
}: {
  user: CUser | null;
  children: React.ReactNode;
}) {
  return (
    <CUserContext.Provider value={user}>{children}</CUserContext.Provider>
  );
}

export function useCUser(): CUser | null {
  return useContext(CUserContext);
}
