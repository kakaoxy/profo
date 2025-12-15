import {
  FileSpreadsheet,
  FileImage,
  FileText,
  File,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * 附件分组配置
 */
export interface AttachmentGroupConfig {
  label: string;
  icon: LucideIcon;
  categories: string[];
}

export const ATTACHMENT_GROUPS: Record<string, AttachmentGroupConfig> = {
  contract: {
    label: "合同类",
    icon: FileText,
    categories: ["signing_contract", "renovation_contract"],
  },
  certificate: {
    label: "证件类",
    icon: File,
    categories: [
      "property_certificate",
      "property_survey",
      "owner_id_card",
      "owner_bank_card",
    ],
  },
  document: {
    label: "交接文件",
    icon: FileSpreadsheet,
    categories: [
      "handover_document",
      "cooperation_confirmation",
      "store_investment_agreement",
      "value_added_service",
    ],
  },
  finance: {
    label: "财务类",
    icon: TrendingUp,
    categories: ["receipt"],
  },
  other: {
    label: "其他",
    icon: File,
    categories: ["other"],
  },
};

/**
 * 附件分类中文标签
 */
export const CATEGORY_LABELS: Record<string, string> = {
  signing_contract: "签约合同",
  property_certificate: "产证",
  property_survey: "产调",
  owner_id_card: "业主身份证",
  owner_bank_card: "业主银行卡",
  renovation_contract: "装修合同",
  handover_document: "房屋交接书",
  receipt: "收款收据",
  cooperation_confirmation: "合作房源确认函",
  store_investment_agreement: "门店跟投协议书",
  value_added_service: "增值服务确认书",
  other: "其他",
};

/**
 * 根据文件类型获取图标
 */
export function getFileIcon(fileType: string) {
  switch (fileType) {
    case "excel":
      return FileSpreadsheet;
    case "image":
      return FileImage;
    case "pdf":
      return FileText;
    case "word":
      return File;
    default:
      return File;
  }
}

/**
 * 文件图标颜色映射
 */
export const FILE_ICON_COLORS: Record<string, string> = {
  excel: "text-green-600",
  image: "text-blue-500",
  pdf: "text-red-500",
  word: "text-blue-700",
  default: "text-gray-500",
};

// 装修阶段定义 (顺序敏感)
export const RENOVATION_STAGES = [
  { key: "demolition", label: "拆除阶段" },
  { key: "design", label: "设计阶段" },
  { key: "hydro", label: "水电阶段" },
  { key: "wood", label: "木瓦阶段" },
  { key: "paint", label: "油漆阶段" },
  { key: "install", label: "安装阶段" },
  { key: "delivery", label: "交付阶段" },
] as const;

export type RenovationStageKey = (typeof RENOVATION_STAGES)[number]["key"];

export const STAGE_CONFIG = [
  { key: "signing", label: "签约阶段", aliases: ["signing", "签约"] },
  {
    key: "renovation",
    label: "装修阶段",
    aliases: [
      "renovation",
      "renovating",
      "装修",
      "construction",
      "hydro",
      "wood",
      "paint",
      "install",
    ],
  },
  { key: "listing", label: "在售阶段", aliases: ["listing", "sales", "在售"] },
  { key: "sold", label: "已售阶段", aliases: ["sold", "done", "已售"] },
] as const;

export type ViewMode = (typeof STAGE_CONFIG)[number]["key"];
