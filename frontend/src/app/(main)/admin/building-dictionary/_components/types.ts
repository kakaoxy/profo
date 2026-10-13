/** 楼盘字典前端类型（与后端 schemas/building_dict.py 对齐）. */

export interface BdKpiResponse {
  community_count: number;
  building_count: number;
  room_count: number;
  linked_project_count: number;
  pending_count: number;
}

export interface BdCommunityListItem {
  id: string;
  name: string;
  district: string | null;
  business_circle: string | null;
  ring: string | null;
  property_types: string[];
  era_from: number | null;
  era_to: number | null;
  address: string | null;
  building_count: number;
  room_count: number;
  linked_project_count: number;
  first_image_url: string | null;
  merged_into_id: string | null;
}

export interface BdCommunityListResponse {
  total: number;
  items: BdCommunityListItem[];
}

export interface BdCommunityDetail {
  id: string;
  name: string;
  district: string | null;
  business_circle: string | null;
  ring: string | null;
  property_types: string[];
  era_from: number | null;
  era_to: number | null;
  developer: string | null;
  property_mgmt: string | null;
  address: string | null;
  lng: number | null;
  lat: number | null;
  building_count: number;
  room_count: number;
  linked_project_count: number;
  first_image_url: string | null;
  merged_into_id: string | null;
  /** 主档视角：已并入本小区的被并小区（软归档），v2.0 合并信息区块 */
  merged_children?: BdMergedChildItem[];
}

export interface BdMergedChildItem {
  id: string;
  name: string;
  address: string | null;
  district: string | null;
  building_count: number;
  room_count: number;
  linked_project_count: number;
}

export interface BdBuildingListItem {
  id: number;
  community_id: string;
  building_no: string;
  lng: number | null;
  lat: number | null;
  room_count: number;
  floor_count: number;
  linked_project_count: number;
  pending: boolean;
  pending_id: number | null;
}

export interface BdRoomItem {
  id: number;
  room_no: string;
  floor: number | null;
  pending: boolean;
  pending_id: number | null;
  plate_no: string;
}

export interface BdBuildingDetail {
  id: number;
  community_id: string;
  building_no: string;
  lng: number | null;
  lat: number | null;
  room_count: number;
  linked_project_count: number;
  pending: boolean;
  rooms: BdRoomItem[];
}

export interface BdReviewListItem {
  id: number;
  kind: string;
  name: string;
  community_id: string | null;
  community_name: string | null;
  parent_kind: string | null;
  parent_id: number | null;
  payload: Record<string, unknown> | null;
  source_type: string | null;
  source_id: string | null;
  submitted_by: string | null;
  submitter_name: string | null;
  status: string;
  created_at: string;
  reference_count: number;
}

export interface BdReviewKpi {
  pending: number;
  processed: number;
  merged_total: number;
  rejected_total: number;
}

export interface BdImportTask {
  id: string;
  user_id: string;
  status: string;
  filename: string;
  file_size: number | null;
  total_communities: number;
  total_buildings: number;
  total_rooms: number;
  warnings_count: number;
  processed_communities: number;
  progress_percent: number;
  communities_loaded: number;
  buildings_loaded: number;
  rooms_loaded: number;
  failed_file_url: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface BdFloorGroup {
  floor: number | null;
  room_count: number;
  has_pending: boolean;
}

/** 小区户型图（复用现有 /admin/communities/{id}/images 端点，FR-20） */
export interface BdCommunityImageItem {
  id: number;
  community_id: string;
  url: string;
  thumbnail_url: string | null;
  description: string | null;
  sort_order: number;
  is_deleted: boolean;
  created_at: string;
}
