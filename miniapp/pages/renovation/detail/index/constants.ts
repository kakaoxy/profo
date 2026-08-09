/**
 * 装修进度详情页 常量、纯函数与展示类型（拆分自 index.ts 以控制单文件行数 < 500）.
 */
import type { components } from "../../../../types/api-types";
import { pad2 } from "../../../../utils/format";

export type RenovationPhotoResponse = components["schemas"]["RenovationPhotoResponse"];
export type RenovationStage = components["schemas"]["RenovationStage"];

/** 装修子阶段顺序（对齐后台 constants.ts RENOVATION_STAGES）. */
export const RENOVATION_STAGES = [
  { key: "demolition", value: "拆除", label: "拆除阶段" },
  { key: "design", value: "设计", label: "设计阶段" },
  { key: "hydro", value: "水电", label: "水电阶段" },
  { key: "wood", value: "木瓦", label: "木瓦阶段" },
  { key: "paint", value: "油漆", label: "油漆阶段" },
  { key: "delivery", value: "交付", label: "交付阶段" },
] as const;

/** 允许上传的图片扩展名（不含扩展名大小写）. */
export const ALLOWED_EXT = /\.(jpe?g|png|webp)$/i;

/** 已上传照片展示结构. */
export interface DisplayPhoto {
  id: string;
  url: string;
  thumb: string;
}

/** 上传中占位项. */
export interface UploadingItem {
  key: string;
  localPath: string;
  percent: number;
  failed: boolean;
}

/** 单阶段展示结构. */
export interface DisplayStage {
  value: string;
  label: string;
  isCompleted: boolean;
  isCurrent: boolean;
  isFuture: boolean;
  finishDate: string;
  completeDate: string;
  photos: DisplayPhoto[];
  uploading: UploadingItem[];
}

/** 今日日期 YYYY-MM-DD（阶段完成 picker 默认值）. */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 完成日期展示：ISO → MM-dd；无/非法返回空串. */
export function formatMonthDay(iso: string): string {
  if (!iso) {
    return "";
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return "";
  }
  return `${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 阶段值 → 展示 label（null/空 → 「未开始」，「已完成」→ 原样）. */
export function toStageLabel(value: RenovationStage | null | undefined): string {
  if (!value) {
    return "未开始";
  }
  const cfg = RENOVATION_STAGES.find((s) => s.value === value);
  return cfg ? cfg.label : value;
}
