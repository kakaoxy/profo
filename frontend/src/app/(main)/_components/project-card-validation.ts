/**
 * 项目卡片数据验证函数
 */

import { toNumber } from "@/lib/number-utils";
import type { ApiSalesRecord, ValidRecordType, TransformedSalesRecord, isValidRecordType } from "./project-card-types";

/**
 * 验证并转换销售记录
 * 用于 mapProjectResponseToProject 内部
 */
export function validateAndTransformSalesRecords(
  data: unknown,
  projectId: string
): TransformedSalesRecord[] | undefined {
  if (!data || !Array.isArray(data)) return undefined;

  const result: TransformedSalesRecord[] = [];

  for (const item of data) {
    if (!item || typeof item !== "object") continue;

    const record = item as Record<string, unknown>;

    // 验证必需字段
    if (typeof record.id !== "string") continue;
    if (typeof record.record_type !== "string") continue;
    if (typeof record.record_date !== "string") continue;

    // 验证 record_type 是有效值
    const recordType = record.record_type;
    if (recordType !== "viewing" && recordType !== "offer" && recordType !== "negotiation" && recordType !== "sold") {
      continue;
    }

    result.push({
      id: record.id,
      project_id: projectId,
      record_type: recordType,
      customer_name: typeof record.customer_name === "string" ? record.customer_name : undefined,
      price: toNumber(record.price as string | number | null | undefined),
      record_date: record.record_date,
      notes: typeof record.notes === "string" ? record.notes : undefined,
    });
  }

  return result.length > 0 ? result : undefined;
}

/**
 * 验证销售记录数组
 * 将 unknown[] 验证并转换为 ApiSalesRecord[]
 */
export function validateSalesRecords(data: unknown): ApiSalesRecord[] {
  if (!data || !Array.isArray(data)) return [];

  const result: ApiSalesRecord[] = [];

  for (const item of data) {
    if (!item || typeof item !== "object") continue;

    const record = item as Record<string, unknown>;

    // 验证必需字段
    if (typeof record.id !== "string") continue;
    if (typeof record.record_type !== "string") continue;
    if (typeof record.record_date !== "string") continue;

    result.push({
      id: record.id,
      record_type: record.record_type,
      price: typeof record.price === "string" || record.price === null ? record.price : undefined,
      record_date: record.record_date,
      customer_name: typeof record.customer_name === "string" || record.customer_name === null ? record.customer_name : undefined,
      notes: typeof record.notes === "string" || record.notes === null ? record.notes : undefined,
    });
  }

  return result;
}
