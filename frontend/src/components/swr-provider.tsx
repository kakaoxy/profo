"use client";

import React from "react";
import { SWRConfig } from "swr";

// 客户端 fetcher，用于浏览器端数据获取
async function clientFetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    credentials: "include",
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: "请求失败" }));
    throw new Error(error.detail || `HTTP ${response.status}`);
  }

  return response.json();
}

// SWR 全局配置选项
const swrConfig = {
  fetcher: clientFetcher,
  revalidateOnFocus: false, // 切换标签页时不自动重新验证
  revalidateOnReconnect: true, // 重新连接网络时重新验证
  dedupingInterval: 2000, // 2秒内重复请求去重
  errorRetryCount: 3, // 错误重试次数
  errorRetryInterval: 5000, // 错误重试间隔
  loadingTimeout: 3000, // 加载超时时间
};

// SWR Provider 组件 - 必须在 Client Component 中定义
export function SWRProvider({ children }: { children: React.ReactNode }) {
  return React.createElement(SWRConfig, { value: swrConfig }, children);
}
