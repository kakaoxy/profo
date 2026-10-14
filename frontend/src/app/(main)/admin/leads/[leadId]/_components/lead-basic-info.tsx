import { Lead } from "../../types";
import { formatPriceWan, formatUnitPriceWan } from "@/lib/formatters";

interface LeadBasicInfoProps {
  lead: Lead;
}

interface InfoField {
  label: string;
  value: string;
}

export function LeadBasicInfo({ lead }: LeadBasicInfoProps) {
  const pending = lead.dictStatus === "pending";
  // 楼盘字典四级地址（surface-dict-binding-info）：非强制字段，有录入才追加；
  // pending 加「未审核」标记；名称缺失回退裸 ID
  const dictFields: InfoField[] = [];
  if (lead.buildingNo || lead.buildingId) {
    dictFields.push({
      label: "楼栋",
      value: lead.buildingNo
        ? `${lead.buildingNo}栋${pending ? "（未审核）" : ""}`
        : `ID:${lead.buildingId}`,
    });
  }
  if (lead.roomNo || lead.roomId) {
    dictFields.push({
      label: "户室",
      value: lead.roomNo
        ? `${lead.roomNo}室${pending ? "（未审核）" : ""}`
        : `ID:${lead.roomId}`,
    });
  }
  const fields: InfoField[] = [
    { label: "业主报价", value: formatPriceWan(lead.totalPrice) },
    {
      label: "评估价",
      value: lead.evalPrice != null ? formatPriceWan(lead.evalPrice) : "-",
    },
    {
      label: "心理预期价",
      value: lead.expectedPrice != null ? formatPriceWan(lead.expectedPrice) : "-",
    },
    { label: "面积", value: `${lead.area}㎡` },
    { label: "户型", value: lead.layout || "-" },
    { label: "楼层", value: lead.floorInfo || "-" },
    ...dictFields,
    { label: "朝向", value: lead.orientation || "-" },
    {
      label: "区域",
      value: lead.district || lead.businessArea ? `${lead.district} - ${lead.businessArea}` : "-",
    },
    { label: "录入人", value: lead.referrerName || lead.creatorName || "-" },
    { label: "单价", value: formatUnitPriceWan(lead.unitPrice) },
  ];

  return (
    <div className="bg-card border border-dove rounded-2xl p-4">
      <div className="grid grid-cols-2 gap-3">
        {fields.map((field) => (
          <div key={field.label} className="flex flex-col gap-0.5">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
              {field.label}
            </span>
            <span className="text-sm font-semibold text-foreground tabular-nums">
              {field.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
