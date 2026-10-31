import { Lead } from "../../types";

const STATUS_LABELS: Record<string, string> = {
  complete: "归属完整",
  missing_store: "缺门店 · 待审核",
  missing_broker: "缺经纪人",
  missing_store_broker: "缺门店与经纪人",
  missing_referrer: "缺员工归因",
  none: "无归属",
};

const FIELDS: { key: keyof Lead; label: string }[] = [
  { key: "referrerName", label: "分享员工" },
  { key: "storeName", label: "推荐门店" },
  { key: "brokerName", label: "推荐经纪人" },
  { key: "storeOwnerName", label: "门店归属员工" },
  { key: "brokerInviterName", label: "经纪人邀请员工" },
];

/** 线索五维归属卡片（V06 REQ-M07-004）：缺值显示「—」，不伪造。 */
export function LeadAttributionCard({ lead }: { lead: Lead }) {
  return (
    <div className="rounded-2xl border border-dove bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink">归属信息</span>
        <span className="rounded-pill bg-fog px-2 py-0.5 text-[11px] text-graphite">
          {STATUS_LABELS[lead.attributionStatus || "none"] || lead.attributionStatus}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {FIELDS.map((field) => (
          <div key={field.label} className="flex flex-col gap-0.5">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{field.label}</span>
            <span className="text-sm font-semibold text-foreground">
              {(lead[field.key] as string | undefined) || "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
