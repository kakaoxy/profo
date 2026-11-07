"use client";

import Link from "next/link";
import { UserRound } from "lucide-react";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { Lead } from "../../types";
import { cn } from "@/lib/utils";

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
    <section className="overflow-hidden rounded-[16px] border border-dove/35 bg-pure-white">
      <div className="flex items-center justify-between border-b border-dove/25 px-5 py-3">
        <span className="inline-flex items-center gap-2 text-[12px] font-[500] text-ink">
          <UserRound className="h-3.5 w-3.5 text-graphite" strokeWidth={1.7} />
          归属信息
        </span>
        {isEmpty ? (
          <span className="rounded-full bg-fog px-2 py-0.5 text-[10px] text-graphite">无归属</span>
        ) : null}
      </div>
      <dl className="px-5 py-1">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-4 border-b border-dove/20 py-2.5 last:border-b-0"
          >
            <dt className="shrink-0 text-[11px] text-graphite">{row.label}</dt>
            <dd className={cn("min-w-0 truncate text-right text-[12px] text-ink")}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
