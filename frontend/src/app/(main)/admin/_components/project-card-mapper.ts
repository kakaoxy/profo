/**
 * 项目数据映射函数
 * 将 API 返回的 ProjectResponse 映射为前端使用的 Project 类型
 */

import type { components } from "@/lib/api-types";
import type { Project } from "../projects/types/project";
import { toNumber } from "@/lib/number-utils";
import { validateAndTransformSalesRecords } from "./project-card-types";

type ProjectResponse = components["schemas"]["ProjectResponse"];

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
    sales_records: validateAndTransformSalesRecords(project.sales_records, project.id),
    created_at: project.created_at ?? "",
    updated_at: project.updated_at ?? "",
    channel_manager_id: project.channel_manager_id ?? undefined,
    property_agent_id: project.property_agent_id ?? undefined,
    negotiator_id: project.negotiator_id ?? undefined,
  };
}
