export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];

export const ALLOWED_IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];

export const MAX_IMAGE_SIZE = 100 * 1024 * 1024;

export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/quicktime", "video/webm"];

export const ALLOWED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm"];

/** 视频最大 500MB，与后端 settings.max_upload_size 对齐 */
export const MAX_VIDEO_SIZE = 500 * 1024 * 1024;

/** 单次最多上传文件数量 */
export const MAX_UPLOAD_FILES = 100;
