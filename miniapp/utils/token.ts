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
 * 读取 c_user_temporary 标识（C 端临时账号）.
 *
 * 微信登录后端可能签发临时账号令牌（is_temporary=true），需引导用户绑定手机号或合并
 * 已有账号。标识以字符串 "true"/"false" 存储，读取时严格匹配 "true" 返回布尔值.
 */
export function getCTemporary(): boolean {
  return wx.getStorageSync("c_user_temporary") === "true";
}

/** 写入 c_user_temporary 标识；true 存 "true"，false 存 "false". */
export function setCTemporary(value: boolean): void {
  wx.setStorageSync("c_user_temporary", value ? "true" : "false");
}

/**
 * 读取 c_phone_prompted 标识（是否已弹过手机号绑定引导）.
 *
 * 用于避免临时账号用户每次进入 profile 页都重复弹窗：用户选「暂不绑定」后置 true，
 * 后续不再自动触发（除非用户主动点击绑定入口）.
 */
export function getPhonePrompted(): boolean {
  return wx.getStorageSync("c_phone_prompted") === "true";
}

/** 写入 c_phone_prompted 标识. */
export function setPhonePrompted(value: boolean): void {
  wx.setStorageSync("c_phone_prompted", value ? "true" : "false");
}

/**
 * 清空 C 端用户状态标识（c_user_temporary 与 c_phone_prompted）.
 *
 * 登出或账号合并成功后调用，避免残留的临时账号标识影响后续登录态判断.
 * 注意：仅清空状态标识，不清空令牌（令牌清空由登出流程单独处理）.
 */
export function clearCUserState(): void {
  wx.removeStorageSync("c_user_temporary");
  wx.removeStorageSync("c_phone_prompted");
}

/**
 * 将 base64url 字符串解码为 binary string（每字符代表一个字节）.
 *
 * 不依赖 atob —— 微信小程序运行时（JSCore/V8 基础库）不提供全局 atob/btoa，
 * 且 JWT payload 为 base64url 且通常无 `=` padding。这里手写解码：
 * base64url → base64（还原 +/，忽略 padding），再按 6bit→8bit 还原字节。
 */
function base64UrlToBinary(b64: string): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let binary = "";
  let buffer = 0;
  let bits = 0;
  for (const ch of b64) {
    if (ch === "=") break;
    const val = chars.indexOf(ch);
    if (val === -1) continue;
    buffer = (buffer << 6) | val;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      binary += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return binary;
}

/**
 * 解析 JWT payload 为对象；解析失败返回 null.
 *
 * JWT payload 为 base64url 编码（无需密钥即可读取，签名校验由后端负责），
 * 前端仅用于同步读取 sub/aud 等声明，作为异步接口（/auth/me）返回前的初值，
 * 避免 onShareAppMessage 等同步回调在身份识别完成前丢失归因。
 */
function parseTokenPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) {
      return null;
    }
    // 返回 binary string（每字符代表一个字节），逐字节 percent-encode 后
    // 交 decodeURIComponent 做 UTF-8 解码；替代已废弃的 escape()，不依赖 TextDecoder
    const binary = base64UrlToBinary(payload);
    const jsonStr = decodeURIComponent(
      Array.from(binary)
        .map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0"))
        .join(""),
    );
    const data = JSON.parse(jsonStr);
    return typeof data === "object" && data !== null ? data : null;
  } catch {
    return null;
  }
}

/**
 * 解析 JWT payload 中的 aud（"c"=C端，"admin"=后台）；解析失败返回空串.
 *
 * 用于在端内区分令牌用途：C 端令牌可访问 /public/*，后台令牌不可，
 * 从而避免把「受众不匹配」的 401 误判为「登录失效」而清空有效登录态.
 */
export function getTokenAud(token: string): string {
  const data = parseTokenPayload(token);
  if (!data) {
    return "";
  }
  const aud = data.aud;
  return typeof aud === "string" ? aud : "";
}

/**
 * 同步读取后台 access_token 中的 sub（即 user.id），解析失败返回空串.
 *
 * 用途：onShareAppMessage / onShareTimeline 是微信同步回调，无法 await
 * 异步的 /auth/me 身份识别。在页面 onLoad 阶段用本函数同步取出当前登录
 * 员工 ID 作为 employeeId 初值，确保「进入页面后立即分享」仍能携带 referrer
 * 归因（见分享归因竞态修复）。token 过期不影响 payload 解读（仅签名由后端校验），
 * 异步 loadEmployee 完成后会写入后端确认的最新值覆盖.
 */
export function getUserIdFromAccessToken(): string {
  const token = getAccessToken();
  if (!token) {
    return "";
  }
  const data = parseTokenPayload(token);
  if (!data) {
    return "";
  }
  const sub = data.sub;
  return typeof sub === "string" ? sub : "";
}
