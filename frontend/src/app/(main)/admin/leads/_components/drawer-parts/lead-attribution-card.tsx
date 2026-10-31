"use client";

import Link from "next/link";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { Lead } from "../../types";

const STATUS_LABELS: Record<string, string> = {
  complete: "归属完整",
  missing_store: "缺门店 · 待审核",
  missing_broker: "缺经纪人",
  missing_store_broker: "缺门店与经纪人",
  missing_referrer: "缺员工归因",
  none: "无归属",
};

/** 历史归属标记（REQ-M07-004 分支 1）：门店/经纪人已停用、合并、搬迁或删除 */
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

const FIELDS: { key: keyof Lead; label: string }[] = [
  { key: "referrerName", label: "分享员工" },
  { key: "storeName", label: "推荐门店" },
  { key: "brokerName", label: "推荐经纪人" },
  { key: "storeOwnerName", label: "门店归属员工" },
  { key: "brokerInviterName", label: "经纪人邀请员工" },
];

/** 线索五维归属卡片（V06 REQ-M07-004）：缺值显示「—」，不伪造。 */
export function LeadAttributionCard({ lead }: { lead: Lead }) {
  const { hasPermission } = usePermission();
  const canOpenStore = hasPermission(PERMISSION_CODES.MERCHANT_READ);
  const canOpenBroker = hasPermission(PERMISSION_CODES.MERCHANT_BROKER);

  const renderValue = (fieldKey: keyof Lead, value?: string) => {
    if (!value) return "—";
    const suffix =
      fieldKey === "storeName"
        ? (STORE_STATUS_SUFFIX[lead.storeStatus || ""] ?? "")
        : fieldKey === "brokerName"
          ? (BROKER_STATUS_SUFFIX[lead.brokerStatus || ""] ?? "")
          : "";
    const href =
      fieldKey === "storeName" && lead.storeId && lead.storeStatus !== "deleted" && canOpenStore
        ? `/admin/merchant/stores/${lead.storeId}`
        : fieldKey === "brokerName" && lead.brokerId && canOpenBroker
          ? `/admin/merchant/brokers?keyword=${encodeURIComponent(value)}`
          : null;
    return (
      <>
        {href ? (
          <Link href={href} className="hover:text-rust hover:underline">
            {value}
          </Link>
        ) : (
          value
        )}
        {suffix}
      </>
    );
  };

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
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {field.label}
            </span>
            <span className="text-sm font-semibold text-foreground">
              {renderValue(field.key, lead[field.key] as string | undefined)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
