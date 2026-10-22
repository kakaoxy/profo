// src/app/(main)/admin/projects/types/project.ts
// 项目核心类型定义
//
// 类型来源约定（AGENTS.md：API 消费类型用 pnpm gen-api 生成，禁手写漂移字段）：
// - 本文件仅保留「前端展示层聚合视图」Project（由 mapProjectResponse /
//   useProjectDetail 从 components["schemas"]["ProjectResponse"] 映射而来），
//   字段一一对应后端 ProjectResponse（backend/schemas/project/core.py）。
// - 后端响应中不存在、也无消费方的手写 ORM 镜像接口（ProjectContract /
//   ProjectOwner / ProjectSale / ProjectFollowUp / ProjectEvaluation /
//   ProjectInteraction / ProjectRenovation）已删除，消费方一律引用
//   @/lib/api-types 的生成类型。

import { AttachmentInfo } from "./attachment";
import { RenovationPhoto } from "./renovation";
import { SalesRecord } from "./sales";

export interface ProjectManager {
  id: string;
  nickname?: string;
  avatar?: string;
  username?: string;
}

export interface ProjectSaleInfo {
  can_edit_sales?: boolean;
}

export interface ProjectRenovationInfo {
  can_edit_renovation?: boolean;
}

export interface Project {
  id: string;
  name: string;
  community_id?: string;
  community_name?: string;
  // 楼盘字典关联（R9 / FR-12）
  building_id?: number | null;
  room_id?: number | null;
  dict_status?: string | null;
  // 字典解析名称（surface-dict-binding-info；pending 时为待审名称）
  building_no?: string | null;
  room_no?: string | null;
  status: string;

  // 业务形式: agent(代理美化) / wholesale(收购美化) / null
  business_form?: "agent" | "wholesale" | null;

  signing_price?: number;
  sold_price?: number;
  list_price?: number;
  area?: number;

  // 行政区（来自小区，前端展示用，非项目持久化字段）
  district?: string | null;

  // 商圈（来自小区，前端展示用，非项目持久化字段）
  business_circle?: string | null;

  layout?: string;
  orientation?: string;
  floor_info?: string;

  // 公用事业户号
  electricity_account?: string | null;
  water_account?: string | null;
  gas_account?: string | null;

  project_manager?: ProjectManager;
  owner_name?: string;
  owner_phone?: string;
  owner_id_card?: string;
  owners?: Array<{
    id?: string;
    owner_name?: string | null;
    owner_phone?: string | null;
    owner_id_card?: string | null;
    bank_name?: string | null;
    bank_card_number?: string | null;
    relation_type?: string | null;
    owner_info?: string | null;
  }>;

  created_at: string;
  updated_at: string;

  signing_date?: string | null;
  planned_handover_date?: string | null;
  sold_date?: string | null;

  listing_date?: string | null;

  // 委托期限
  commission_start_date?: string | null;
  commission_end_date?: string | null;

  // 用时天数（已售项目：sold_date - listing_date）
  days_on_market?: number | null;

  contract_no?: string;
  signing_period?: number;
  extension_period?: number;
  extension_rent?: number;
  cost_assumption_type?: string;
  cost_assumption_other?: string;
  other_agreements?: string;
  // 后端真源 SigningMaterial[]（schemas/project/contract.py）；条目内 url 必有，
  // 兼容读历史 string[] 形态的历史快照数据
  signing_materials?: (AttachmentInfo | string)[] | null;

  // 备注：后端真源为 owner_info（提交侧 notes 会被映射到 owner_info，
  // 见 backend/services/projects/internal/updater.py::_update_owner_fields）
  owner_info?: string;
  address?: string;
  renovation_stage?: string;

  renovation_photos?: RenovationPhoto[];
  sales_records?: SalesRecord[];
  renovationStageDates?: Record<string, string> | null;
  total_income?: number;
  total_expense?: number;
  net_cash_flow?: number;
  roi?: number;

  // 销售角色ID字段（真源；展示名由页面级 usersById 解析）
  channel_manager_id?: string;
  property_agent_id?: string;
  negotiator_id?: string;

  // 销售子模块权限标志（含 can_edit_sales）
  sale?: ProjectSaleInfo | null;
  // 装修子模块权限标志（含 can_edit_renovation）
  renovation?: ProjectRenovationInfo | null;

  // 归档状态（独立于 status 生命周期；true 时全部写入口锁定，需反归档）
  is_archived?: boolean;
  archived_at?: string | null; // YYYY-MM-DD
  archived_note?: string | null;
  // 是否可归档（后端派生字段，status ∈ ARCHIVABLE_STATUSES；归档入口显隐单一判据）
  can_archive?: boolean;
}
