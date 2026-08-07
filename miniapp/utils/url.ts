import { BASE_ORIGIN } from "./config";

/**
 * 将后端返回的资源 URL 解析为小程序可加载的完整 URL.
 * - null/undefined/空：返回空字符串
 * - 完整 URL（http/https）或 data URI：原样返回
 * - 相对路径（/static/uploads/...）：拼接 BASE_ORIGIN（无 /api/v1 前缀）
 *
 * 后端 StaticFiles 挂载在根路径 /static，不在 API_V1_PREFIX 下；
 * local 存储模式返回相对路径 /static/uploads/xxx.jpg，
 * 小程序 <image src> 无法直接加载，必须拼接后端 origin（不含 /api/v1）.
 */
export function resolveAssetUrl(url: string | null | undefined): string {
  if (!url) {
    return "";
  }
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) {
    return url;
  }
  return `${BASE_ORIGIN}${url}`;
}
