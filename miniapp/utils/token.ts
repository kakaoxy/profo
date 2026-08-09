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
    // atob 返回 binary string（每字符代表一个字节），逐字节 percent-encode 后
    // 交 decodeURIComponent 做 UTF-8 解码；替代已废弃的 escape()，不依赖 TextDecoder
    const binary = atob(b64);
    const jsonStr = decodeURIComponent(
      Array.from(binary)
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    const data = JSON.parse(jsonStr);
    return typeof data.aud === "string" ? data.aud : "";
  } catch {
    return "";
  }
}
