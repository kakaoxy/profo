import type { components, paths } from "@/lib/api-types";

export type InvestmentListResponse = components["schemas"]["InvestmentListResponse"];
export type InvestmentStatsResponse = components["schemas"]["InvestmentStatsResponse"];
export type InvestmentResponse = components["schemas"]["InvestmentResponse"];
export type InvestmentCreate = components["schemas"]["InvestmentCreate"];
export type InvestmentUpdate = components["schemas"]["InvestmentUpdate"];
export type InvestorCreate = components["schemas"]["InvestorCreate"];
export type InvestorUpdate = components["schemas"]["InvestorUpdate"];
export type InvestorResponse = components["schemas"]["InvestorResponse"];
export type ReturnAdjustmentBatchRequest =
  components["schemas"]["ReturnAdjustmentBatchRequest"];
export type ReturnAdjustmentItem = components["schemas"]["ReturnAdjustmentItem"];
export type ReturnAdjustmentResponse = components["schemas"]["ReturnAdjustmentResponse"];
export type SettlementChangeRequest = components["schemas"]["SettlementChangeRequest"];
export type UnsettleRequest = components["schemas"]["UnsettleRequest"];
export type CopyInvestmentRequest = components["schemas"]["CopyInvestmentRequest"];
export type ProjectListResponse =
  paths["/api/v1/projects"]["get"]["responses"][200]["content"]["application/json"];
type ProjectResponse = components["schemas"]["ProjectResponse"];

export type InvestmentListQuery = NonNullable<
  paths["/api/v1/admin/investments"]["get"]["parameters"]["query"]
>;

export interface InvestmentListParams {
  search?: string;
  project_status?: string;
  settlement_status?: string;
  page?: number;
  page_size?: number;
}

export interface ExportParams {
  search?: string;
  project_status?: string;
  settlement_status?: string;
}

// 项目简要信息(前端视图类型,基于生成类型 ProjectResponse 派生)
// 与 ProjectResponse 的差异:
// - name 收紧为 string(后端可空,前端以 ?? "" 兜底)
// - status 放宽为 string | null(后端为 ProjectStatus 枚举)
// - project_code 映射自后端 contract_no(前端字段名)
export type ProjectBrief = Pick<
  ProjectResponse,
  "id" | "community_name" | "address"
> & {
  name: string;
  status?: string | null;
  project_code?: string | null;
};

export type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; message: string };
