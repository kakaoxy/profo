"use client";

import { AttachmentCategory, AttachmentType } from "./schema";

// 日期处理工具函数 - 内联避免时区问题
/** 将 Date 转为 YYYY-MM-DD 字符串 */
export const toDateStr = (d: Date | undefined | null): string | null =>
  d
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : null;

/** 将 YYYY-MM-DD 字符串转为 Date */
export const fromDateStr = (s: string | undefined | null): Date | undefined =>
  s ? new Date(s + "T00:00:00") : undefined;

// 解析户型字符串为数字
export function parseLayout(
  layout: string | undefined
): { rooms?: number; halls?: number; bathrooms?: number } {
  if (!layout) return {};
  const match = layout.match(/(\d+)室(\d+)厅(\d+)卫/);
  if (!match) return {};
  return {
    rooms: parseInt(match[1], 10),
    halls: parseInt(match[2], 10),
    bathrooms: parseInt(match[3], 10),
  };
}

// 组合户型数字为字符串
export function buildLayout(
  rooms?: number,
  halls?: number,
  bathrooms?: number
): string | undefined {
  const hasRooms = rooms !== undefined && rooms > 0;
  const hasHalls = halls !== undefined && halls > 0;
  const hasBathrooms = bathrooms !== undefined && bathrooms > 0;
  if (!hasRooms && !hasHalls && !hasBathrooms) return undefined;
  return `${rooms || 0}室${halls || 0}厅${bathrooms || 0}卫`;
}

// 附件数据转换接口
export interface AttachmentInput {
  filename: string;
  url: string;
  category: string;
  fileType: string;
  size?: number;
}

/**
 * 转换后端附件数据为前端格式
 */
export function convertAttachments(
  materials: unknown[] | { attachments?: AttachmentInput[] } | null | undefined
): Array<{
  id: string;
  filename: string;
  url: string;
  category: AttachmentCategory;
  fileType: AttachmentType;
  size: number;
  uploadedAt: string;
}> {
  if (!materials) return [];

  // 如果是数组（附件对象数组）
  if (Array.isArray(materials)) {
    return materials.map((item: unknown) => {
      // 检查是字符串（旧URL格式）还是对象（新格式）
      if (typeof item === "string") {
        // 旧格式：URL字符串
        const url = item;
        return {
          id: Math.random().toString(36).substring(7),
          filename: url.split("/").pop() || "unknown",
          url: url,
          category: "other" as AttachmentCategory,
          fileType: "pdf" as AttachmentType,
          size: 0,
          uploadedAt: new Date().toISOString(),
        };
      }
      // 新格式：附件对象
      const att = item as AttachmentInput;
      return {
        id: Math.random().toString(36).substring(7),
        filename: att.filename || "unknown",
        url: att.url,
        category: (att.category || "other") as AttachmentCategory,
        fileType: (att.fileType || "pdf") as AttachmentType,
        size: att.size || 0,
        uploadedAt: new Date().toISOString(),
      };
    });
  }

  // 如果是对象（旧格式，包含 attachments 数组）
  if (
    typeof materials === "object" &&
    materials !== null &&
    "attachments" in materials
  ) {
    const mats = materials as { attachments?: AttachmentInput[] };
    return (
      mats.attachments?.map((att) => ({
        ...att,
        id: Math.random().toString(36).substring(7),
        uploadedAt: new Date().toISOString(),
        category: att.category as AttachmentCategory,
        fileType: att.fileType as AttachmentType,
        size: att.size || 0,
      })) || []
    );
  }

  return [];
}
