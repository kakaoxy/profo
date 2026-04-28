"use client";

import type { components } from "@/lib/api-types";
import type { Project } from "../projects/types/project";
import { toNumber } from "@/lib/number-utils";

type ProjectResponse = components["schemas"]["ProjectResponse"];
type ApiSalesRecord = {
  id: string;
  record_type: string;
  price?: string | null;
  record_date: string;
  customer_name?: string | null;
  notes?: string | null;
};

export { toNumber };

export function mapProjectResponseToProject(project: ProjectResponse): Project {
  return {
    id: project.id,
    name: project.name ?? "",
    community_id: project.community_id ?? undefined,
    community_name: project.community_name ?? undefined,
    status: project.status,
    address: project.address ?? undefined,
    area: toNumber(project.area),
    layout: project.layout ?? undefined,
    orientation: project.orientation ?? undefined,
    signing_price: toNumber(project.signing_price),
    signing_date: project.signing_date ?? undefined,
    signing_period: project.signing_period ?? undefined,
    extension_period: project.extension_period ?? undefined,
    extension_rent: toNumber(project.extension_rent),
    cost_assumption_type: project.cost_assumption_type ?? undefined,
    cost_assumption_other: project.cost_assumption_other ?? undefined,
    planned_handover_date: project.planned_handover_date ?? undefined,
    other_agreements: project.other_agreements ?? undefined,
    renovation_stage: project.renovation_stage ?? undefined,
    contract_no: project.contract_no ?? undefined,
    list_price: toNumber(project.list_price),
    listing_date: project.listing_date ?? undefined,
    sold_price: toNumber(project.sold_price),
    sold_date: project.sold_date ?? undefined,
    total_income: toNumber(project.total_income),
    total_expense: toNumber(project.total_expense),
    net_cash_flow: toNumber(project.net_cash_flow),
    roi: project.roi ?? undefined,
    project_manager: project.project_manager
      ? {
          id: project.project_manager.id,
          nickname: project.project_manager.nickname ?? undefined,
          username: project.project_manager.username ?? undefined,
          avatar: project.project_manager.avatar ?? undefined,
        }
      : undefined,
    sales_records: project.sales_records
      ? (project.sales_records as Array<{
          id: string;
          record_type: string;
          price?: string | null;
          record_date: string;
          customer_name?: string | null;
          notes?: string | null;
        }>).map(r => ({
          id: r.id,
          project_id: project.id,
          record_type: r.record_type as "viewing" | "offer" | "negotiation" | "sold",
          customer_name: r.customer_name ?? undefined,
          price: toNumber(r.price),
          record_date: r.record_date,
          notes: r.notes ?? undefined,
        }))
      : undefined,
    created_at: project.created_at ?? "",
    updated_at: project.updated_at ?? "",
    // 销售团队角色ID
    channel_manager_id: project.channel_manager_id ?? undefined,
    property_agent_id: project.property_agent_id ?? undefined,
    negotiator_id: project.negotiator_id ?? undefined,
  };
}

// 获取本周一和上周一（按日历周计算）
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // 调整为周一开始
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getWeekViewStats(viewingRecords: ApiSalesRecord[]) {
  const now = new Date();
  const thisWeekStart = getWeekStart(now);
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setMilliseconds(-1);

  const currentWeekViews = viewingRecords.filter(r => {
    const d = new Date(r.record_date);
    return d >= thisWeekStart;
  }).length;

  const lastWeekViews = viewingRecords.filter(r => {
    const d = new Date(r.record_date);
    return d >= lastWeekStart && d <= lastWeekEnd;
  }).length;

  return { currentWeekViews, lastWeekViews };
}

export function getOfferStats(offerRecords: ApiSalesRecord[]) {
  const offerCount = offerRecords.length;

  const offerPrices = offerRecords
    .map(r => toNumber(r.price))
    .filter((p): p is number => p !== undefined);

  const maxOffer = offerPrices.length > 0 ? Math.max(...offerPrices) : 0;
  const lastOffer = offerPrices.length > 0 ? offerPrices[offerPrices.length - 1] : 0;

  return { offerCount, maxOffer, lastOffer };
}

export const statusMap: Record<string, { label: string; color: string }> = {
  signing: { label: "已签约", color: "bg-blue-100 text-blue-700" },
  renovating: { label: "装修中", color: "bg-yellow-100 text-yellow-700" },
  selling: { label: "在售中", color: "bg-green-100 text-green-700" },
  sold: { label: "已成交", color: "bg-purple-100 text-purple-700" },
};
