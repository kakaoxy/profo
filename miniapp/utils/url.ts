import { BASE_ORIGIN, OSS_BASE_URL, WATERMARK_STYLE } from "./config";

/**
 * 解码小程序 onLoad query 参数（微信不自动解码）：
 * - 已是中文等无 `%` 序列的串：decodeURIComponent 为 no-op，安全；
 * - 编码串（如 %E9%80%9A...）：解码回原文；
 * - 含非法 `%` 序列：抛错回退原值.
 */
export function decodeQueryParam(value: string | undefined): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

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

/** OSS 图片处理样式参数（水印），样式名来自根目录 .env 的 OSS_WATERMARK_STYLE. */
const WATERMARK_STYLE_PARAM = `x-oss-process=style/${WATERMARK_STYLE}`;

/** 显式尺寸请求参数（P-03：列表封面按展示尺寸请求缩略图）. */
export interface ImageResizeOptions {
  /** 目标宽度 px（如 750），拼接 resize,w_750. */
  width?: number;
  /** 目标质量 1-100（如 80），拼接 quality,q_80. */
  quality?: number;
}

/**
 * 解析展示用图片 URL，OSS 图片追加处理参数.
 * - 仅 OSS 域名前缀命中才拼接：本地模式相对路径先拼 origin（不加水印）、
 *   data URI 与第三方 URL 原样返回
 * - 已含 x-oss-process 则跳过（幂等）
 * - 已有查询参数用 & 拼，否则用 ? 拼
 * - 传 opts.width/quality 时拼接 image/resize 参数（列表缩略图场景，放弃水印保尺寸优化）；
 *   不传时默认拼接水印样式参数（详情大图保护）
 * 视频等非图片资源禁止使用本函数（图片样式参数会导致 OSS 处理失败）.
 */
export function resolveImageUrl(
  url: string | null | undefined,
  opts?: ImageResizeOptions,
): string {
  const base = resolveAssetUrl(url);
  if (!base || !base.startsWith(`${OSS_BASE_URL}/`) || base.includes("x-oss-process=")) {
    return base;
  }
  if (opts?.width || opts?.quality) {
    // 显式尺寸：OSS image 处理参数（与 style 参数互斥，同一 URL 仅一个 x-oss-process）
    const parts: string[] = [];
    if (opts.width) {
      parts.push(`resize,w_${opts.width}`);
    }
    if (opts.quality) {
      parts.push(`quality,q_${opts.quality}`);
    }
    return `${base}${base.includes("?") ? "&" : "?"}x-oss-process=image/${parts.join("/")}`;
  }
  return `${base}${base.includes("?") ? "&" : "?"}${WATERMARK_STYLE_PARAM}`;
}
