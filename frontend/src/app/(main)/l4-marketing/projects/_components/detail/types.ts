import type { L4MarketingProject, L4MarketingMedia } from "@/app/(main)/l4-marketing/projects/types";

// 营销详情头部组件属性
export interface MarketingDetailHeaderProps {
  project: L4MarketingProject;
  onClose: () => void;
}

// 营销信息区域组件属性
export interface MarketingInfoSectionProps {
  project: L4MarketingProject;
  onPreviewImage?: (url: string) => void;
}

// 物理信息区域组件属性
export interface PhysicalInfoSectionProps {
  project: L4MarketingProject;
}

// 基础配置区域组件属性
export interface BasicConfigSectionProps {
  project: L4MarketingProject;
  onPreviewImage?: (url: string) => void;
}

// 照片区域组件属性
export interface PhotosSectionProps {
  project: L4MarketingProject;
  photos: L4MarketingMedia[];
}

// 图片预览对话框组件属性
export interface ImagePreviewDialogProps {
  imageUrl: string | null;
  onClose: () => void;
}
