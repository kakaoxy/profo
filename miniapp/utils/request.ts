import { BASE_URL } from "./config";

/**
 * 请求参数.
 * url: 以 `/` 开头的相对路径，如 `/public/stats/platform`，会与 BASE_URL 拼接.
 * method: 默认 GET；GET 不携带 Authorization header.
 * data: 请求体或查询参数.
 * header: 自定义请求头.
 */
export interface RequestOptions {
  url: string;
  method?: "GET" | "POST";
  data?: object;
  header?: Record<string, string>;
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

/**
 * 封装 wx.request，返回 Promise<T>.
 * - GET 请求不携带 Authorization header.
 * - url 与 BASE_URL 拼接（options.url 以 `/` 开头）.
 * - HTTP 非 2xx 时 reject { statusCode, body }；网络异常 reject { errMsg }.
 */
export function request<T>(options: RequestOptions): Promise<T> {
  const { url, method = "GET", data, header } = options;

  const requestHeader: Record<string, string> = { ...header };
  if (method !== "GET") {
    // 写请求可在调用方按需注入 Authorization（如登录态）；GET 不携带.
    if (header?.Authorization) {
      requestHeader.Authorization = header.Authorization;
    }
  } else {
    delete requestHeader.Authorization;
  }

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
        } else {
          const error: HttpResponseError = {
            statusCode,
            body: res.data,
          };
          reject(error);
        }
      },
      fail: (err) => {
        const networkError: NetworkError = { errMsg: err.errMsg };
        reject(networkError);
      },
    });
  });
}
