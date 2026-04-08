import type { components } from "@/lib/api-types";

// ============================================================================
// L4 Marketing Project Types
// ============================================================================

export type L4MarketingProject = components["schemas"]["L4MarketingProjectResponse"];

export type L4MarketingProjectCreate =
  components["schemas"]["L4MarketingProjectCreate"];
export type L4MarketingProjectUpdate =
  components["schemas"]["L4MarketingProjectUpdate"];
export type L4MarketingProjectListResponse =
  components["schemas"]["L4MarketingProjectListResponse"];

// ============================================================================
// L4 Marketing Media Types
// ============================================================================

type L4MarketingMediaResponse = components["schemas"]["L4MarketingMediaResponse"];

export type L4MarketingMedia = L4MarketingMediaResponse & {
  /** File path for the media */
  file_path?: string;
  /** Photo category: marketing or renovation */
  photo_category: PhotoCategory;
};

export type L4MarketingMediaCreate =
  components["schemas"]["L4MarketingMediaCreate"];
export type L4MarketingMediaUpdate =
  components["schemas"]["L4MarketingMediaUpdate"];
export type L4MarketingMediaListResponse =
  components["schemas"]["L4MarketingMediaListResponse"];

// ============================================================================
// Project Status
// ============================================================================

export type MarketingProjectStatus = "在途" | "在售" | "已售";
export type PublishStatus = "草稿" | "发布";

export const MARKETING_PROJECT_STATUS = {
  IN_PROGRESS: "在途" as const,
  FOR_SALE: "在售" as const,
  SOLD: "已售" as const,
};

export const PUBLISH_STATUS = {
  DRAFT: "草稿" as const,
  PUBLISHED: "发布" as const,
};

export const MARKETING_PROJECT_STATUS_CONFIG: Record<
  MarketingProjectStatus,
  { label: string; color: string; bgColor: string; description: string }
> = {
  在途: {
    label: "在途",
    color: "#3b82f6", // blue-500
    bgColor: "#dbeafe", // blue-100
    description: "项目进行中，尚未挂牌",
  },
  在售: {
    label: "在售",
    color: "#22c55e", // green-500
    bgColor: "#dcfce7", // green-100
    description: "已挂牌销售",
  },
  已售: {
    label: "已售",
    color: "#6b7280", // gray-500
    bgColor: "#f3f4f6", // gray-100
    description: "已成交",
  },
};

export const PUBLISH_STATUS_CONFIG: Record<
  PublishStatus,
  { label: string; color: string; bgColor: string }
> = {
  草稿: {
    label: "草稿",
    color: "#f59e0b", // amber-500
    bgColor: "#fef3c7", // amber-100
  },
  发布: {
    label: "已发布",
    color: "#10b981", // emerald-500
    bgColor: "#d1fae5", // emerald-100
  },
};

// ============================================================================
// Photo Category
// ============================================================================

export type PhotoCategory = "marketing" | "renovation";

export const PHOTO_CATEGORY = {
  MARKETING: "marketing" as const,
  RENOVATION: "renovation" as const,
};

export const PHOTO_CATEGORY_CONFIG: Record<
  PhotoCategory,
  { label: string; color: string; bgColor: string; description: string }
> = {
  marketing: {
    label: "营销照片",
    color: "#005daa",
    bgColor: "#e5eeff",
    description: "用于房源展示的营销图片",
  },
  renovation: {
    label: "改造照片",
    color: "#22c55e",
    bgColor: "#dcfce7",
    description: "记录装修改造过程的照片",
  },
};

// ============================================================================
// Media Types
// ============================================================================

export type MediaType = "image" | "video";

export const MEDIA_TYPE = {
  IMAGE: "image" as const,
  VIDEO: "video" as const,
};

// ============================================================================
// Renovation Stages
// ============================================================================

export type RenovationStage =
  | "拆除"
  | "水电"
  | "木瓦"
  | "油漆"
  | "安装"
  | "交付"
  | "other";

export const RENOVATION_STAGES: { value: RenovationStage; label: string }[] = [
  { value: "拆除", label: "拆除阶段" },
  { value: "水电", label: "水电阶段" },
  { value: "木瓦", label: "木瓦阶段" },
  { value: "油漆", label: "油漆阶段" },
  { value: "安装", label: "安装阶段" },
  { value: "交付", label: "交付阶段" },
  { value: "other", label: "其他" },
];

// ============================================================================
// User Type (for consultant soft reference)
// ============================================================================

export interface User {
  id: number;
  username: string;
  real_name?: string;
  avatar?: string;
  phone?: string;
}

// ============================================================================
// Legacy Types (for backward compatibility during migration)
// ============================================================================

/** @deprecated Use L4MarketingProject instead */
export type MiniProject = L4MarketingProject;
/** @deprecated Use L4MarketingProjectCreate instead */
export type MiniProjectCreate = L4MarketingProjectCreate;
/** @deprecated Use L4MarketingProjectUpdate instead */
export type MiniProjectUpdate = L4MarketingProjectUpdate;
/** @deprecated Use L4MarketingMedia instead */
export type MiniProjectPhoto = L4MarketingMedia;
