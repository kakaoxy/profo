/**
 * 请求体存储管理器
 *
 * 用于在 API 客户端中间件中缓存请求体，以便在 401 响应重试时恢复请求内容。
 * 使用 WeakMap 确保请求对象被垃圾回收时自动清理对应的缓存，
 * 无需手动管理生命周期。
 */

const requestBodyStore = new WeakMap<Request, string>();

/**
 * 缓存请求体文本，供 401 重试时恢复。
 */
export function storeRequestBody(request: Request, bodyText: string): void {
  requestBodyStore.set(request, bodyText);
}

/**
 * 取出并清理请求体。若不存在返回 undefined。
 */
export function consumeRequestBody(request: Request): string | undefined {
  const bodyText = requestBodyStore.get(request);
  requestBodyStore.delete(request);
  return bodyText;
}
