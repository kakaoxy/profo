/**
 * sales_records 类型收窄工具.
 *
 * ProjectResponse.sales_records 在 OpenAPI 生成类型中为弱类型
 * `{ [key: string]: unknown }[] | null`（见 types/api-types.d.ts），无法直接获得
 * SalesRecordResponse 的字段提示。这里集中做一次类型收窄/兜底映射，
 * 替换散落各页面的 `as SalesRecordResponse[]` / `as { record_type?: string }`
 * 强转，避免字段漂移（见代码审查 🟡-?）。
 */
import type { components } from "../../../types/api-types";

type SalesRecordResponse = components["schemas"]["SalesRecordResponse"];
type RecordType = components["schemas"]["RecordType"];

/** 仅当值为 string 时返回，否则 undefined（兜底非法/缺失字段）. */
function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * 将松类型 sales_records 收窄为 SalesRecordResponse[]。
 * 非法项（非对象）跳过；缺失/类型不符字段给安全兜底值，保证后续按
 * record_type 过滤、customer_name/price/notes/record_date 取值不再依赖强转。
 */
export function parseSalesRecords(
  records: { [key: string]: unknown }[] | null | undefined,
): SalesRecordResponse[] {
  if (!Array.isArray(records)) {
    return [];
  }
  const out: SalesRecordResponse[] = [];
  for (const raw of records) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const r = raw as { [key: string]: unknown };
    out.push({
      id: str(r.id) ?? "",
      project_id: str(r.project_id) ?? "",
      record_type: (str(r.record_type) ?? "viewing") as RecordType,
      customer_name: str(r.customer_name),
      customer_phone: str(r.customer_phone),
      customer_info:
        (r.customer_info as SalesRecordResponse["customer_info"]) ?? undefined,
      record_date: str(r.record_date) ?? "",
      record_time: str(r.record_time),
      price: r.price != null ? String(r.price) : undefined,
      notes: str(r.notes),
      feedback: str(r.feedback),
      result: str(r.result),
      related_agent: str(r.related_agent),
      created_at: str(r.created_at) ?? "",
      operator: (r.operator as SalesRecordResponse["operator"]) ?? undefined,
    });
  }
  return out;
}