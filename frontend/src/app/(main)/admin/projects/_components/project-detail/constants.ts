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

/**
 * 文书 / 附件分类（6 类，与后端 documents.category 枚举对齐）
 */
export const DOCUMENT_CATEGORIES = [
  { value: "contract_agreement", label: "合同及协议文件" },
  { value: "property_rights", label: "产权及权属调查文件" },
  { value: "identity_account", label: "身份及账户文件" },
  { value: "finance_tax", label: "财务及税费文件" },
  { value: "handover", label: "房屋交接文件" },
  { value: "other", label: "其他文件" },
] as const;

export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]["value"];

export const ATTACHMENT_GROUPS: Record<string, AttachmentGroupConfig> = {
  contract_agreement: {
    label: "合同及协议文件",
    icon: FileText,
    categories: ["contract_agreement"],
  },
  property_rights: {
    label: "产权及权属调查文件",
    icon: File,
    categories: ["property_rights"],
  },
  identity_account: {
    label: "身份及账户文件",
    icon: FileImage,
    categories: ["identity_account"],
  },
  finance_tax: {
    label: "财务及税费文件",
    icon: TrendingUp,
    categories: ["finance_tax"],
  },
  handover: {
    label: "房屋交接文件",
    icon: FileSpreadsheet,
    categories: ["handover"],
  },
  other: {
    label: "其他文件",
    icon: File,
    categories: ["other"],
  },
};

/**
 * 附件分类中文标签
 */
export const CATEGORY_LABELS: Record<string, string> = {
  contract_agreement: "合同及协议文件",
  property_rights: "产权及权属调查文件",
  identity_account: "身份及账户文件",
  finance_tax: "财务及税费文件",
  handover: "房屋交接文件",
  other: "其他文件",
};

/**
 * 旧 12 类 → 新 6 类映射（向后兼容历史 signing_materials）
 * 未知值统一归入 other
 */
const LEGACY_CATEGORY_MAP: Record<string, DocumentCategory> = {
  signing_contract: "contract_agreement",
  renovation_contract: "contract_agreement",
  cooperation_confirmation: "contract_agreement",
  store_investment_agreement: "contract_agreement",
  value_added_service: "contract_agreement",
  property_certificate: "property_rights",
  property_survey: "property_rights",
  owner_id_card: "identity_account",
  owner_bank_card: "identity_account",
  receipt: "finance_tax",
  handover_document: "handover",
  other: "other",
};

export function mapLegacyAttachmentCategory(category: string): string {
  // 已是新分类的直接透传，避免上传后保存的 contract_agreement 等被误归类为 other
  if (DOCUMENT_CATEGORIES.some((c) => c.value === category)) {
    return category;
  }
  return LEGACY_CATEGORY_MAP[category] ?? "other";
}

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
  excel: "text-success",
  image: "text-primary",
  pdf: "text-error",
  word: "text-primary/80",
  default: "text-muted-foreground",
};

// [修复] 增加 value 字段，对应后端的中文 Enum
// 已移除"安装"阶段，与后端 RenovationStage 枚举保持一致
export const RENOVATION_STAGES = [
  { key: "demolition", value: "拆除", label: "拆除阶段" },
  { key: "design", value: "设计", label: "设计阶段" },
  { key: "hydro", value: "水电", label: "水电阶段" },
  { key: "wood", value: "木瓦", label: "木瓦阶段" },
  { key: "paint", value: "油漆", label: "油漆阶段" },
  { key: "delivery", value: "交付", label: "交付阶段" },
] as const;

// 保持原来的 aliases 配置不变，或者你可以把 value 加入 aliases
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
      "拆除",
      "设计",
      "水电",
      "木瓦",
      "油漆",
      "交付",
    ],
  },
  { key: "selling", label: "在售阶段", aliases: ["selling", "sales", "在售"] },
  { key: "sold", label: "已售阶段", aliases: ["sold", "done", "已售"] },
  { key: "ended", label: "已下架", aliases: ["ended", "已下架"] },
] as const;

export type RenovationStageKey = (typeof RENOVATION_STAGES)[number]["key"];
export type ViewMode = (typeof STAGE_CONFIG)[number]["key"];
