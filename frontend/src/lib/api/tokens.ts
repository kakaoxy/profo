/**
 * 认证请求通用工具（自 `@/auth` 迁入，消除 admin-auth → auth 的反向依赖，spec D13）。
 *
 * - `fetchWithTimeout`：登录/刷新/me 请求的超时保护
 * - `extractApiError`：后端错误体 → 可读消息（兼容 {"code","message"} 与 {"detail"}）
 */

/**
 * 给 fetch 加超时保护，防止后端挂起时前端永久卡死。
 *
 * 后端 /token 或 /me 挂起时（如 admin /me 的权限慢查询），无超时会导致
 * loginAction 永不返回，登录页 isPending 永久 true。超时后抛
 * Error("登录服务响应超时")，由 loginAction catch 转为可读错误。
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs = 15000,
): Promise<Response> {
  const controller = new AbortController();
  // 仅当超时触发时为 true，用于在 catch 中区分超时与调用者主动 abort
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  // 复用调用者传入的 signal：外部 abort 时同步触发内部 controller，
  // 避免直接覆盖 init.signal 导致调用者的 abort 逻辑失效。
  const externalSignal = init.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      // 超时给出可读提示；调用者主动 abort 时透传原错误，不误报为超时
      if (timedOut) {
        throw new Error("登录服务响应超时，请稍后重试");
      }
    }
    throw error;
  } finally {
    clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener("abort", onExternalAbort);
    }
  }
}

/**
 * 从后端错误响应提取可读消息。
 *
 * 优先读新格式 {"code":≠0, "message":"..."} (AGENTS.md §2)，回退旧格式
 * {"detail": "..."} (FastAPI 默认) 与嵌套 {"error": {"message": ...}}。
 */
export async function extractApiError(response: Response, fallback: string): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (typeof data !== "object" || data === null) return fallback;
    const obj = data as Record<string, unknown>;
    if (typeof obj.message === "string") return obj.message;
    if (typeof obj.detail === "string") return obj.detail;
    const err = obj.error as Record<string, unknown> | undefined;
    if (err && typeof err.message === "string") return err.message;
    return fallback;
  } catch {
    return fallback;
  }
}
