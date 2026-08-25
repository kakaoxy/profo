import { BASE_URL } from "./config";
import { getAccessToken, getCAccessToken, getCRefreshToken, getRefreshToken } from "./token";

/**
 * 请求参数.
 * url: 以 `/` 开头的相对路径，如 `/public/stats/platform`，会与 BASE_URL 拼接.
 * method: 默认 GET.
 * data: 请求体或查询参数.
 * header: 自定义请求头（显式传入 Authorization 时优先保留，不被自动注入覆盖）.
 * skipAuth: 是否跳过自动鉴权；公开接口（如 /public/communities/search）置 true，
 *   避免向其发送用户令牌。默认 false——所有请求自动从 storage 读取 access_token 注入，
 *   防止新页面遗漏鉴权头而静默发出无鉴权 GET（见代码审查 🟡-4）。
 * timeout: 覆盖全局默认超时（默认 DEFAULT_TIMEOUT=15s）.
 * cacheKey: GET 幂等请求的内存缓存 key（SWR：成功响应写入；页面侧命中缓存先渲染再静默刷新）.
 * cacheTtl: 缓存有效期 ms（默认 60s）.
 */
export interface RequestOptions {
  url: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  data?: object | string;
  header?: Record<string, string>;
  skipAuth?: boolean;
  timeout?: number;
  cacheKey?: string;
  cacheTtl?: number;
}

/** 全局默认请求超时（ms）. */
export const DEFAULT_TIMEOUT = 15000;

/** 内存缓存默认有效期（ms）. */
const DEFAULT_CACHE_TTL = 60_000;

/** 内存级响应缓存（SWR：页面命中缓存先渲染，后台请求刷新后覆盖）. */
const memoryCache = new Map<string, { data: unknown; expires: number }>();

/** 读取内存缓存（未命中/过期返回 undefined）. */
export function getCacheData<T>(key: string): T | undefined {
  const hit = memoryCache.get(key);
  if (!hit || hit.expires < Date.now()) {
    memoryCache.delete(key);
    return undefined;
  }
  return hit.data as T;
}

/** 写入内存缓存. */
export function setCacheData(key: string, data: unknown, ttl = DEFAULT_CACHE_TTL): void {
  memoryCache.set(key, { data, expires: Date.now() + ttl });
}

/** 失效内存缓存（列表追加/变更后调用）. */
export function invalidateCache(key: string): void {
  memoryCache.delete(key);
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
 * 正在进行的后台 access_token 刷新 Promise（并发复用，语义同 refreshCAccessToken）.
 */
let refreshPromise: Promise<string | null> | null = null;

/**
 * 刷新后台 access_token：用 refresh_token 调 /auth/refresh（aud=admin）.
 *
 * - 成功：更新 storage 中的 access_token / refresh_token（轮换），返回新 access_token；
 * - 失败（refresh_token 过期/无效）：清除失效的后台令牌，返回 null；
 * - 网络异常：不清除令牌，返回 null；
 * - 并发：复用 refreshPromise，避免多次刷新触发轮换冲突.
 *
 * 与 refreshCAccessToken 对称，保证后台接口（如 /projects、/projects/my-responsible）
 * 过期后也能自动续期，而非强制用户重新登录。
 */
export function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) {
    return refreshPromise;
  }
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return Promise.resolve(null);
  }
  const promise = new Promise<string | null>((resolve) => {
    wx.request({
      url: `${BASE_URL}/auth/refresh`,
      method: "POST",
      data: { refresh_token: refreshToken },
      header: { "Content-Type": "application/json" },
      timeout: DEFAULT_TIMEOUT,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const data = res.data as TokenRefreshResponse | undefined;
          if (data?.access_token) {
            wx.setStorageSync("access_token", data.access_token);
            if (data.refresh_token) {
              wx.setStorageSync("refresh_token", data.refresh_token);
            }
            resolve(data.access_token);
            return;
          }
        }
        // 刷新失败（refresh_token 过期/无效），清除失效的后台令牌
        wx.removeStorageSync("access_token");
        wx.removeStorageSync("refresh_token");
        resolve(null);
      },
      fail: () => {
        // 网络异常，不清除令牌（可能临时网络问题，下次请求可再试）
        resolve(null);
      },
    });
  });
  refreshPromise = promise;
  // 刷新完成后清空引用（无论成功失败），允许后续再次刷新
  const clearRef = () => {
    if (refreshPromise === promise) {
      refreshPromise = null;
    }
  };
  promise.then(clearRef, clearRef);
  return promise;
}

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
      timeout: DEFAULT_TIMEOUT,
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
 * - 401 时按接口受众自动刷新对应端令牌并重试一次（/public/* → C 端，其余 → 后台），
 *   避免 access_token 过期后频繁强制用户重新登录；
 * - 调用方显式传入 header.Authorization 时优先保留；
 * - HTTP 非 2xx reject { statusCode, body }；网络异常 reject { errMsg }.
 */
export function request<T>(options: RequestOptions): Promise<T> {
  const {
    url,
    method = "GET",
    data,
    header,
    skipAuth = false,
    timeout = DEFAULT_TIMEOUT,
    cacheKey,
    cacheTtl,
  } = options;

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

  const doFetch = () =>
    doRequest<T>(url, method, data, requestHeader, skipAuth, false, false, timeout);

  // GET 幂等 + cacheKey：成功后写入内存缓存，供页面 SWR（先渲染缓存再静默刷新）
  if (method === "GET" && cacheKey) {
    return doFetch().then((res) => {
      setCacheData(cacheKey, res, cacheTtl);
      return res;
    });
  }
  return doFetch();
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
  networkRetried: boolean,
  timeout: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    wx.request({
      url: `${BASE_URL}${url}`,
      method,
      data,
      header: requestHeader,
      timeout,
      success: (res) => {
        const statusCode = res.statusCode;
        if (statusCode >= 200 && statusCode < 300) {
          resolve(res.data as T);
          return;
        }
        // 401 且未跳过鉴权且未重试过：access_token 可能过期，按接口受众刷新对应端令牌后重试一次。
        // - /public/* → 刷新 C 端令牌（refreshCAccessToken）
        // - 其余后台接口 → 刷新后台令牌（refreshAccessToken）
        if (statusCode === 401 && !skipAuth && !retried) {
          const refresh = url.startsWith("/public/") ? refreshCAccessToken : refreshAccessToken;
          refresh().then((newToken) => {
            if (newToken) {
              requestHeader.Authorization = `Bearer ${newToken}`;
              doRequest<T>(url, method, data, requestHeader, skipAuth, true, networkRetried, timeout)
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
        if (method === "GET" && !networkRetried) {
          // GET 幂等：网络失败重试 1 次（300ms 退避）；POST/PUT/DELETE 非幂等不重试
          setTimeout(() => {
            doRequest<T>(url, method, data, requestHeader, skipAuth, retried, true, timeout)
              .then(resolve)
              .catch(reject);
          }, 300);
          return;
        }
        const networkError: NetworkError = { errMsg: err.errMsg };
        reject(networkError);
      },
    });
  });
}
