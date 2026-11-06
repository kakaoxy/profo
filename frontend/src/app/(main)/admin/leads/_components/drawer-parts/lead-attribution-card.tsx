"use client";

import Link from "next/link";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { Lead } from "../../types";

/** 历史归属标记：门店/经纪人已停用、合并、搬迁或删除 */
const STORE_STATUS_SUFFIX: Record<string, string> = {
  disabled: "（已停用）",
  merged: "（已合并）",
  relocated: "（已搬迁）",
  deleted: "（已删除）",
};
const BROKER_STATUS_SUFFIX: Record<string, string> = {
  disabled: "（已停用）",
  unbound_after: "（已解绑）",
};

/** 线索归属卡片：推荐经纪人（含门店）、对接人、分享员工三项。 */
export function LeadAttributionCard({ lead }: { lead: Lead }) {
  const { hasPermission } = usePermission();
  const canOpenBroker = hasPermission(PERMISSION_CODES.MERCHANT_BROKER);

  const brokerLabel = lead.brokerName
    ? `${lead.brokerName}${lead.storeName ? `（${lead.storeName}）` : ""}${
        BROKER_STATUS_SUFFIX[lead.brokerStatus || ""] ?? ""
      }${lead.storeStatus ? (STORE_STATUS_SUFFIX[lead.storeStatus] ?? "") : ""}`
    : "—";

  const rows = [
    {
      label: "推荐经纪人",
      value:
        lead.brokerName && lead.brokerId && canOpenBroker ? (
          <Link
            href={`/admin/merchant/brokers?keyword=${encodeURIComponent(lead.brokerName)}`}
            className="hover:text-rust hover:underline"
          >
            {brokerLabel}
          </Link>
        ) : (
          brokerLabel
        ),
    },
    { label: "对接人", value: lead.ownerEmployeeName || "—" },
    { label: "分享员工", value: lead.referrerName || "—" },
  ];
  const isEmpty = !lead.brokerName && !lead.ownerEmployeeName && !lead.referrerName;

  return (
    <div className="rounded-2xl border border-dove bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[13px] font-medium text-ink">归属信息</span>
        {isEmpty ? (
          <span className="rounded-pill bg-fog px-2 py-0.5 text-[11px] text-graphite">无归属</span>
        ) : null}
      </div>
      <dl className="flex flex-col gap-2.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-4">
            <dt className="shrink-0 text-[11px] tracking-wide text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 truncate text-right text-sm font-semibold text-foreground">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
