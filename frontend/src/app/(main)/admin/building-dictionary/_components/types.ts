/**
 * 楼盘字典前端类型（M4 修复：全部由 pnpm gen-api 生成类型派生，禁手写 DTO；
 * 源 schema 与后端 schemas/building_dict.py 一一对应）.
 *
 * 注：后端 PG text[] 列在 schema 层未标 Optional 但历史数据可能为 null，
 * 派生类型收敛为必有数组（与原手写类型一致），消费方以 `?? []` 兜底。
 */

import type { components } from "@/lib/api-types";

type Schemas = components["schemas"];

export type BdKpiResponse = Schemas["BdKpiResponse"];
export type BdCommunityListItem = Omit<Schemas["BdCommunityListItem"], "property_types"> & {
  property_types: string[];
};
export type BdCommunityListResponse = Schemas["BdCommunityListResponse"];
export type BdCommunityDetail = Omit<Schemas["BdCommunityDetailResponse"], "property_types"> & {
  property_types: string[];
};
export type BdMergedChildItem = Schemas["BdMergedChildItem"];
export type BdBuildingListItem = Schemas["BdBuildingListItem"];
export type BdRoomItem = Omit<Schemas["BdRoomItem"], "floor" | "pending_id"> & {
  floor: number | null;
  pending_id: number | null;
};
export type BdBuildingDetail = Schemas["BdBuildingDetail"];
export type BdReviewListItem = Schemas["BdReviewListItem"];
export type BdReviewKpi = Schemas["BdReviewKpi"];
export type BdImportTask = Schemas["BdImportTaskResponse"];
export type BdFloorGroup = Omit<Schemas["BdFloorGroup"], "floor"> & { floor: number | null };

/** 小区户型图（复用现有 /admin/communities/{id}/images 端点，FR-20） */
export type BdCommunityImageItem = Schemas["CommunityImageResponse"];
