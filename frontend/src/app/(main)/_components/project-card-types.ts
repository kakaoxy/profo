import { toNumber } from "@/lib/number-utils";

export type ApiSalesRecord = {
  id: string;
  record_type: string;
  price?: string | number | null;
  record_date: string;
  customer_name?: string | null;
  notes?: string | null;
};

const VALID_RECORD_TYPES = ["viewing", "offer", "negotiation", "sold"] as const;
export type ValidRecordType = (typeof VALID_RECORD_TYPES)[number];

export function isValidRecordType(type: string): type is ValidRecordType {
  return VALID_RECORD_TYPES.includes(type as ValidRecordType);
}

export interface TransformedSalesRecord {
  id: string;
  project_id: string;
  record_type: ValidRecordType;
  customer_name?: string;
  price?: number;
  record_date: string;
  notes?: string;
}

export function validateAndTransformSalesRecords(
  data: unknown,
  projectId: string
): TransformedSalesRecord[] | undefined {
  if (!data || !Array.isArray(data)) return undefined;

  const result: TransformedSalesRecord[] = [];

  for (const item of data) {
    if (!item || typeof item !== "object") continue;

    const record = item as Record<string, unknown>;

    if (typeof record.id !== "string") continue;
    if (typeof record.record_type !== "string") continue;
    if (typeof record.record_date !== "string") continue;

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

export function validateSalesRecords(data: unknown): ApiSalesRecord[] {
  if (!data || !Array.isArray(data)) return [];

  const result: ApiSalesRecord[] = [];

  for (const item of data) {
    if (!item || typeof item !== "object") continue;

    const record = item as Record<string, unknown>;

    if (typeof record.id !== "string") continue;
    if (typeof record.record_type !== "string") continue;
    if (typeof record.record_date !== "string") continue;

    result.push({
      id: record.id,
      record_type: record.record_type,
      price: typeof record.price === "string" || typeof record.price === "number" || record.price === null ? record.price : undefined,
      record_date: record.record_date,
      customer_name: typeof record.customer_name === "string" || record.customer_name === null ? record.customer_name : undefined,
      notes: typeof record.notes === "string" || record.notes === null ? record.notes : undefined,
    });
  }

  return result;
}