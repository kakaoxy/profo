// Detail 组件导出
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
