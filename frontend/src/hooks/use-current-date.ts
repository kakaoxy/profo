import { useSyncExternalStore } from "react";

const emptySubscribe = () => () => {};

let clientDate: Date | null = null;

function getClientDate(): Date {
  if (!clientDate) {
    clientDate = new Date();
  }
  return clientDate;
}

/** 获取客户端当前日期，SSR 时返回 null，避免 hydration 不匹配 */
export function useCurrentDate(): Date | null {
  return useSyncExternalStore(
    emptySubscribe,
    getClientDate,
    () => null,
  );
}
