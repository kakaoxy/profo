/**
 * ⚠️ 警告：此文件为 barrel file，不建议使用
 *
 * @deprecated 使用此 barrel file 会导致打包工具无法进行 tree-shaking，增加 bundle 大小。
 * 请直接从具体模块导入所需内容。
 *
 * ❌ 避免这样使用：
 *   import { MarketingPhotoList } from "./index";
 *   import { formatDate } from "./index";
 *
 * ✅ 推荐这样使用：
 *   import { MarketingPhotoList } from "./marketing-photo-list";
 *   import { formatDate } from "./utils";
 *
 * 预计在未来的版本中会移除此 barrel file。
 */

// ==================== ⚠️ 以下导出仅供向后兼容，请勿在新代码中使用 ====================

// 组件导出
export { MarketingPhotoList } from "./marketing-photo-list";
export { RenovationPhotoList } from "./renovation-photo-list";
export { PhotosSection } from "./photos-section";
export { OptimizedPhotoItem } from "./optimized-photo-item";
export { ImagePreviewDialog } from "./image-preview-dialog";
export { MarketingInfoSection } from "./marketing-info-section";
export { PhysicalInfoSection } from "./physical-info-section";
export { BasicConfigSection } from "./basic-config-section";
export { MarketingDetailHeader } from "./marketing-detail-header";

// 工具函数
export {
  getFileUrl,
  getOptimizedImageUrl,
  getResponsiveImageSrc,
  preloadImage,
  preloadImages,
  formatDate,
  getRelativeTime,
  formatPrice,
  formatArea,
  getStatusConfig,
  getPublishStatusConfig,
} from "./utils";

// 性能监控
export {
  usePerformanceMonitor,
  useImagePerformanceMonitor,
  useVirtualListMonitor,
  PerformanceReport,
} from "./performance-monitor";

// 类型
export type {
  MarketingDetailHeaderProps,
  MarketingInfoSectionProps,
  PhysicalInfoSectionProps,
  BasicConfigSectionProps,
  PhotosSectionProps,
  ImagePreviewDialogProps,
} from "./types";
