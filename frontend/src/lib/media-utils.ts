/**
 * 媒体文件工具函数
 * 提供媒体类型检测、URL处理等功能
 */

/** 视频文件扩展名列表 */
export const VIDEO_EXTENSIONS = [
  ".mp4",
  ".webm",
  ".ogg",
  ".mov",
  ".avi",
  ".mkv",
] as const;

/** 图片文件扩展名列表 */
export const IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".bmp",
] as const;

/**
 * 检测媒体类型
 * @param url - 文件URL
 * @returns 'image' | 'video' | undefined
 */
export function detectMediaType(
  url: string | undefined | null
): "image" | "video" | undefined {
  if (!url) return undefined;

  const lowerUrl = url.toLowerCase();

  if (VIDEO_EXTENSIONS.some((ext) => lowerUrl.endsWith(ext))) {
    return "video";
  }

  if (IMAGE_EXTENSIONS.some((ext) => lowerUrl.endsWith(ext))) {
    return "image";
  }

  return undefined;
}

/**
 * 判断是否为视频文件
 * @param url - 文件URL
 * @returns boolean
 */
export function isVideoFile(url: string | undefined | null): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lowerUrl.endsWith(ext));
}

/**
 * 判断是否为图片文件
 * @param url - 文件URL
 * @returns boolean
 */
export function isImageFile(url: string | undefined | null): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lowerUrl.endsWith(ext));
}
