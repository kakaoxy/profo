/**
 * 媒体文件校验（装修 / 营销上传共用）
 * 图片 ≤ MAX_IMAGE_SIZE、视频 ≤ MAX_VIDEO_SIZE，类型须在图片/视频白名单内
 */
import {
  ALLOWED_IMAGE_TYPES,
  ALLOWED_VIDEO_TYPES,
  MAX_IMAGE_SIZE,
  MAX_VIDEO_SIZE,
} from "@/lib/constants";
import { formatFileSize } from "@/lib/formatters";

/** 允许的媒体类型（图片 + 视频） */
export const ALLOWED_MEDIA_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

/** 根据文件类型推断是否为视频 */
export function isVideoFile(file: File): boolean {
  return file.type.startsWith("video/");
}

/** 按文件类型校验：图片 >100MB 或视频 >500MB 或非法类型则返回错误信息 */
export function validateMediaFile(file: File): string | null {
  const isVideo = isVideoFile(file);
  if (isVideo && file.size > MAX_VIDEO_SIZE) {
    return `视频文件过大，最大支持 ${formatFileSize(MAX_VIDEO_SIZE)}`;
  }
  if (!isVideo && file.size > MAX_IMAGE_SIZE) {
    return `图片文件过大，最大支持 ${formatFileSize(MAX_IMAGE_SIZE)}`;
  }
  if (!ALLOWED_MEDIA_TYPES.includes(file.type)) {
    return "不支持的文件格式";
  }
  return null;
}
