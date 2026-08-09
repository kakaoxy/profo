import { BASE_URL } from "./config";
import { getAccessToken, getCAccessToken, getCRefreshToken } from "./token";

/**
 * 请求参数.
 * url: 以 `/` 开头的相对路径，如 `/public/stats/platform`，会与 BASE_URL 拼接.
 * method: 默认 GET.
 * data: 请求体或查询参数.
 * header: 自定义请求头（显式传入 Authorization 时优先保留，不被自动注入覆盖）.
 * skipAuth: 是否跳过自动鉴权；公开接口（如 /public/communities/search）置 true，
 *   避免向其发送用户令牌。默认 false——所有请求自动从 storage 读取 access_token 注入，
 *   防止新页面遗漏鉴权头而静默发出无鉴权 GET（见代码审查 🟡-4）。
 */
export interface RequestOptions {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  data?: object | string;
  header?: Record<string, string>;
  skipAuth?: boolean;
}

/** HTTP 非 2xx 时 reject 的错误，附带状态码与响应体. */
export interface HttpResponseError {
  statusCode: number;
  body: unknown;
}

/** 网络异常时 reject 的错误，附带 wx.request 的 errMsg. */
export interface NetworkError {
  errMsg: string;
}

/** C 端令牌刷新响应（仅取需要的字段，与后端 PublicLoginResponse 对齐）. */
interface TokenRefreshResponse {
  access_token: string;
  refresh_token: string;
}

/**
 * 正在进行的 C 端令牌刷新 Promise.
 *
 * 并发控制：多个 /public/* 请求同时 401 时只刷新一次。后端 refresh_token 轮换防重放
 * （同一 refresh_token 第二次使用会 401），若不复用会导致第二个并发请求刷新失败。
 */
let refreshCPromise: Promise<string | null> | null = null;

/**
 * 刷新 C 端 access_token：用 c_refresh_token 调 /public/auth/refresh.
 *
 * - 成功：更新 storage 中的 c_access_token / c_refresh_token（轮换），返回新 access_token；
 * - 失败（refresh_token 过期/无效）：清除失效的 C 端令牌，返回 null；
 * - 网络异常：不清除令牌（临时问题，下次请求可再试），返回 null；
 * - 并发：复用 refreshCPromise，避免多次刷新触发轮换冲突.
 *
 * 直接用 wx.request 调用，不经过 doRequest，避免 refresh 请求本身 401 触发刷新死循环.
 *
 * 导出供 wx.uploadFile 等不经过 request<T> 的场景复用（如 submit 页上传户型图）.
 */
export function refreshCAccessToken(): Promise<string | null> {
  if (refreshCPromise) {
    return refreshCPromise;
  }
  const cRefreshToken = getCRefreshToken();
  if (!cRefreshToken) {
    return Promise.resolve(null);
  }
  const promise = new Promise<string | null>((resolve) => {
    wx.request({
      url: `${BASE_URL}/public/auth/refresh`,
      method: "POST",
      data: { refresh_token: cRefreshToken },
      header: { "Content-Type": "application/json" },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const data = res.data as TokenRefreshResponse | undefined;
          if (data?.access_token) {
            wx.setStorageSync("c_access_token", data.access_token);
            if (data.refresh_token) {
              wx.setStorageSync("c_refresh_token", data.refresh_token);
            }
            resolve(data.access_token);
            return;
          }
        }
        // 刷新失败（refresh_token 过期/无效），清除失效的 C 端令牌
        wx.removeStorageSync("c_access_token");
        wx.removeStorageSync("c_refresh_token");
        resolve(null);
      },
      fail: () => {
        // 网络异常，不清除令牌（可能临时网络问题，下次请求可再试）
        resolve(null);
      },
    });
  });
  refreshCPromise = promise;
  // 刷新完成后清空引用（无论成功失败），允许后续再次刷新；
  // 用 .then(same, same) 而非 .finally 以兼容更低版本运行时
  const clearRef = () => {
    if (refreshCPromise === promise) {
      refreshCPromise = null;
    }
  };
  promise.then(clearRef, clearRef);
  return promise;
}

/**
 * 封装 wx.request，返回 Promise<T>.
 * - 自动注入 Authorization（/public/* 优先用 c_access_token，其他用 access_token）；
 * - /public/* 请求 401 时自动刷新 c_access_token 并重试一次（access_token 30 分钟过期，
 *   需靠 refresh_token 续期，避免用户频繁重新登录）；
 * - 调用方显式传入 header.Authorization 时优先保留；
 * - HTTP 非 2xx reject { statusCode, body }；网络异常 reject { errMsg }.
 */
export function request<T>(options: RequestOptions): Promise<T> {
  const { url, method = "GET", data, header, skipAuth = false } = options;

  const requestHeader: Record<string, string> = { ...header };
  if (!skipAuth && !requestHeader.Authorization) {
    // /public/* 路径优先用 C 端令牌（aud=c）：内部员工持 admin 令牌时需 C 端令牌
    // 才能访问 /public/leads 等接口（后端按路径推断期望受众并严格校验 aud）。
    let token = getAccessToken();
    if (url.startsWith("/public/")) {
      const cToken = getCAccessToken();
      if (cToken) {
        token = cToken;
      }
    }
    if (token) {
      requestHeader.Authorization = `Bearer ${token}`;
    }
  }

  return doRequest<T>(url, method, data, requestHeader, skipAuth, false);
}

/**
 * 实际发起请求并处理 401 自动刷新重试.
 *
 * retried 标志防止重试请求再次 401 时无限触发刷新（新令牌仍 401 说明刷新无效或权限问题，
 * 不再重试，直接 reject 让调用方处理）。
 */
function doRequest<T>(
  url: string,
  method: "GET" | "POST" | "PUT" | "DELETE",
  data: RequestOptions["data"],
  requestHeader: Record<string, string>,
  skipAuth: boolean,
  retried: boolean,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${url}`,
      method,
      data,
      header: requestHeader,
      success: (res) => {
        const statusCode = res.statusCode;
        if (statusCode >= 200 && statusCode < 300) {
          resolve(res.data as T);
          return;
        }
        // /public/* 401 且未跳过鉴权且未重试过：c_access_token 可能过期，刷新后重试一次
        if (statusCode === 401 && url.startsWith("/public/") && !skipAuth && !retried) {
          refreshCAccessToken().then((newToken) => {
            if (newToken) {
              requestHeader.Authorization = `Bearer ${newToken}`;
              doRequest<T>(url, method, data, requestHeader, skipAuth, true)
                .then(resolve)
                .catch(reject);
            } else {
              const error: HttpResponseError = { statusCode, body: res.data };
              reject(error);
            }
          });
          return;
        }
        const error: HttpResponseError = { statusCode, body: res.data };
        reject(error);
      },
      fail: (err) => {
        const networkError: NetworkError = { errMsg: err.errMsg };
        reject(networkError);
      },
    });
  });
}
