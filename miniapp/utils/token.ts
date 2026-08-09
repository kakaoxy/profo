/**
 * 解析 JWT payload 中的 aud（"c"=C端，"admin"=后台）；解析失败返回空串.
 *
 * 用于在端内区分令牌用途：C 端令牌可访问 /public/*，后台令牌不可，
 * 从而避免把「受众不匹配」的 401 误判为「登录失效」而清空有效登录态.
 */
export function getTokenAud(token: string): string {
  try {
    const payload = token.split(".")[1];
    if (!payload) {
      return "";
    }
    const b64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const data = JSON.parse(decodeURIComponent(escape(atob(b64))));
    return typeof data.aud === "string" ? data.aud : "";
  } catch {
    return "";
  }
}
