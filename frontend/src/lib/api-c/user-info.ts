import { useCallback, useRef, useSyncExternalStore } from "react";

export interface UserInfo {
  nickname: string | null;
  phone: string | null;
}

const EMPTY_INFO: UserInfo = { nickname: null, phone: null };

export function getUserInfoFromCookie(): UserInfo {
  if (typeof document === "undefined") return EMPTY_INFO;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith("c_user_info="));
  if (!match) return EMPTY_INFO;
  try {
    const raw = decodeURIComponent(match.split("=").slice(1).join("="));
    return JSON.parse(raw) as UserInfo;
  } catch {
    return EMPTY_INFO;
  }
}

function getServerSnapshot(): UserInfo {
  return EMPTY_INFO;
}

function subscribe(): () => void {
  return () => {};
}

/**
 * 以 hydration-safe 方式读取 cookie 中的用户信息。
 * SSR 与 hydration 首帧返回空值（与 server 一致），
 * hydration 完成后切换为客户端 cookie 快照并触发重渲染。
 * 缓存为组件实例级（useRef），避免全局污染。
 */
export function useUserInfo(): UserInfo {
  const cacheRef = useRef<UserInfo | null>(null);
  const getSnapshot = useCallback(() => {
    const latest = getUserInfoFromCookie();
    // 只有数据真正变化时才更新引用，避免无限重渲染
    if (
      cacheRef.current === null ||
      JSON.stringify(cacheRef.current) !== JSON.stringify(latest)
    ) {
      cacheRef.current = latest;
    }
    return cacheRef.current;
  }, []);
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
