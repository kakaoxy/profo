/**
 * 令牌存取与解析工具.
 *
 * - getAccessToken / getRefreshToken：安全读取 storage 中的令牌，非字符串值返回空串，
 *   避免 `wx.getStorageSync(...) as string` 在 storage 被写入非字符串时拼出
 *   "Bearer undefined"（见代码审查 🔵-3）。
 * - getCAccessToken / getCRefreshToken：C 端令牌（aud=c），用于 /public/* 接口。
 *   内部员工持 admin 令牌时另存 C 端令牌，使 /public/leads 等接口可正常访问。
 * - getTokenAud：解析 JWT payload 中的 aud（"c"=C端，"admin"=后台），用于端内身份识别。
 */

/** 读取 access_token；storage 中为非字符串值时返回空串. */
export function getAccessToken(): string {
  const val = wx.getStorageSync("access_token");
  return typeof val === "string" ? val : "";
}

/** 读取 refresh_token；storage 中为非字符串值时返回空串. */
export function getRefreshToken(): string {
  const val = wx.getStorageSync("refresh_token");
  return typeof val === "string" ? val : "";
}

/** 读取 C 端 access_token（aud=c，用于 /public/* 接口）；非字符串值返回空串. */
export function getCAccessToken(): string {
  const val = wx.getStorageSync("c_access_token");
  return typeof val === "string" ? val : "";
}

/** 读取 C 端 refresh_token；非字符串值返回空串. */
export function getCRefreshToken(): string {
  const val = wx.getStorageSync("c_refresh_token");
  return typeof val === "string" ? val : "";
}

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
