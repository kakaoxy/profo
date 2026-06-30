"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { components } from "@/lib/api-types";
import { extractPaginatedData } from "@/lib/api-helpers";
import { getProjectDetailAction } from "../core";
import {
  getCompetitorsAction,
  getCompetitorsByCommunityAction,
} from "./competitors";
import type {
  BrawlInitResult,
  BrawlItem,
  BrawlPageParams,
  BrawlPageResult,
  PropertyItem,
} from "./types";

type ProjectResponse = components["schemas"]["ProjectResponse"];

const MAX_COMMUNITIES = 5;

/** 将后端房源映射为竞品肉搏战条目（按 status 字段判定在售/已售）. */
function mapPropertyToBrawlItem(p: PropertyItem): BrawlItem {
  const isSold = p.status === "成交";
  const status = isSold ? "sold" : "on_sale";
  return {
    id: String(p.id),
    community: p.community_name || "",
    status,
    display_status: p.status,
    layout: p.layout_display || `${p.rooms}室${p.halls}厅`,
    floor: p.floor_display || p.floor_level || "-",
    area: p.build_area || 0,
    total:
      p.total_price ||
      Math.round(((p.unit_price || 0) * (p.build_area || 0)) / 10000),
    unit: p.unit_price || 0,
    date:
      (isSold
        ? p.sold_date?.split("T")[0]
        : p.listed_date?.split("T")[0]) ||
      p.updated_at?.split("T")[0] ||
      "-",
    source: p.data_source || "未知",
  };
}

/** 构造“本项目”对照条目（仅未售且未删除项目）. */
function buildSelfItem(project: ProjectResponse): BrawlItem | null {
  // ProjectStatus 枚举: signing | renovating | selling | sold | deleted
  if (project.status === "sold" || project.status === "deleted") return null;
  const area = project.area ? Number(project.area) : 0;
  const listPrice = project.list_price
    ? Number(project.list_price)
    : project.signing_price
      ? Number(project.signing_price)
      : 0;
  const unitPrice =
    area > 0 && listPrice > 0 ? Math.round((listPrice * 10000) / area) : 0;
  return {
    id: `Self-${project.id}`,
    community: project.community_name || "本项目",
    status: "on_sale",
    display_status: "挂牌",
    layout: "-",
    floor: "中楼层",
    area,
    total: listPrice,
    unit: unitPrice,
    date: new Date().toISOString().split("T")[0],
    source: "内部",
    is_current: true,
  };
}

/** 获取小区集合的在售/已售总数（page_size=1 仅取 total）. */
async function fetchCounts(
  client: Awaited<ReturnType<typeof fetchClient>>,
  communityIds: string[],
): Promise<{ on_sale: number; sold: number }> {
  if (communityIds.length === 0) return { on_sale: 0, sold: 0 };
  const idsParam = communityIds.join(",");
  const [onSaleRes, soldRes] = await Promise.all([
    client.GET("/api/v1/properties", {
      params: {
        query: {
          community_ids: idsParam,
          status: "在售",
          page: 1,
          page_size: 1,
        },
      },
    }),
    client.GET("/api/v1/properties", {
      params: {
        query: {
          community_ids: idsParam,
          status: "成交",
          page: 1,
          page_size: 1,
        },
      },
    }),
  ]);
  if (onSaleRes.error) {
    const detail = (onSaleRes.error as { detail?: string }).detail;
    throw new Error(`获取在售计数失败: ${detail || "未知错误"}`);
  }
  if (soldRes.error) {
    const detail = (soldRes.error as { detail?: string }).detail;
    throw new Error(`获取成交计数失败: ${detail || "未知错误"}`);
  }
  const onSale = extractPaginatedData<PropertyItem>(onSaleRes.data);
  const sold = extractPaginatedData<PropertyItem>(soldRes.data);
  return { on_sale: onSale?.total ?? 0, sold: sold?.total ?? 0 };
}

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; message: string };

/**
 * 初始化竞品肉搏战：派生竞品小区集合、在售/已售计数、本项目条目.
 * 仅在 projectId/communityId 变化时调用一次.
 */
export async function getCompetitorsBrawlInitAction(
  scope: { projectId: string } | { communityId: string },
): Promise<ActionResult<BrawlInitResult>> {
  try {
    let communityIds: string[] = [];
    let selfItem: BrawlItem | null = null;

    if ("projectId" in scope) {
      const [projectResult, competitorsResult] = await Promise.all([
        getProjectDetailAction(scope.projectId, true),
        getCompetitorsAction(scope.projectId),
      ]);
      if (!projectResult.success || !projectResult.data) {
        return { success: false, message: "获取项目信息失败" };
      }
      const project = projectResult.data;
      if (!project.community_id) {
        return { success: false, message: "项目未关联小区" };
      }
      const competitorIds =
        competitorsResult.success && competitorsResult.data
          ? competitorsResult.data.map((c) => c.community_id)
          : [];
      communityIds = Array.from(
        new Set([project.community_id, ...competitorIds]),
      ).slice(0, MAX_COMMUNITIES);
      selfItem = buildSelfItem(project);
    } else {
      const competitorsResult =
        await getCompetitorsByCommunityAction(scope.communityId);
      const competitorIds =
        competitorsResult.success && competitorsResult.data
          ? competitorsResult.data.map((c) => c.community_id)
          : [];
      communityIds = Array.from(
        new Set([scope.communityId, ...competitorIds]),
      ).slice(0, MAX_COMMUNITIES);
    }

    const client = await fetchClient();
    const counts = await fetchCounts(client, communityIds);

    return { success: true, data: { communityIds, counts, selfItem } };
  } catch (e) {
    const message = e instanceof Error ? e.message : "网络错误";
    logger.error("获取竞品初始化数据失败:", e);
    return { success: false, message };
  }
}

/**
 * 分页查询竞品房源（单次后端请求，按 status/rooms/名称/排序过滤）.
 */
export async function getCompetitorsBrawlPageAction(
  communityIds: string[],
  params: BrawlPageParams,
): Promise<ActionResult<BrawlPageResult>> {
  try {
    if (communityIds.length === 0) {
      return {
        success: true,
        data: {
          items: [],
          total: 0,
          page: params.page,
          page_size: params.page_size,
        },
      };
    }
    const client = await fetchClient();
    const { data, error } = await client.GET("/api/v1/properties", {
      params: {
        query: {
          community_ids: communityIds.join(","),
          status: params.status,
          page: params.page,
          page_size: params.page_size,
          rooms: params.rooms,
          community_name: params.community_name,
          sort_by: params.sort_by,
          sort_order: params.sort_order,
        },
      },
    });
    if (error) {
      const detail = (error as { detail?: string }).detail;
      return {
        success: false,
        message: `获取房源失败: ${detail || "未知错误"}`,
      };
    }
    const pageData = extractPaginatedData<PropertyItem>(data);
    const items = (pageData?.items ?? []).map(mapPropertyToBrawlItem);
    return {
      success: true,
      data: {
        items,
        total: pageData?.total ?? 0,
        page: params.page,
        page_size: params.page_size,
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : "网络错误";
    logger.error("获取竞品分页数据失败:", e);
    return { success: false, message };
  }
}
