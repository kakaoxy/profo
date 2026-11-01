"use client";

/**
 * 后台客户端请求封装（跨模块共用）：自动带 CSRF 头，统一错误信息。
 *
 * 由商户模块原有 `merchant-api.ts` 提升而来，区域/商圈字典迁到楼盘字典模块后
 * 两个模块都需要同一套请求语义，故上移到 admin 层共享。
 */
export async function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "XMLHttpRequest",
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(body?.message || `请求失败（${response.status}）`);
  }
  return (await response.json()) as T;
}

export function queryString(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      search.set(key, String(value));
    }
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}
