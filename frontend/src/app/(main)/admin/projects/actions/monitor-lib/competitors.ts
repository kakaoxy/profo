"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { CompetitorItem } from "./types";
import { getProjectDetailAction } from "../core";
import { extractApiData, extractPaginatedData } from "@/lib/api-helpers";

/**
 * 获取当前小区的竞品列表
 * 流程: projectId → community_id → competitors API
 */
export async function getCompetitorsAction(projectId: string) {
  try {
    // 1. 获取项目详情，提取 community_id
    const projectResult = await getProjectDetailAction(projectId, false);
    if (!projectResult.success || !projectResult.data) {
      return { success: false, message: "获取项目信息失败" };
    }

    const communityId = projectResult.data.community_id;
    if (!communityId) {
      return { success: false, message: "项目未关联小区" };
    }

    // 2. 调用竞品 API
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/monitor/communities/{community_id}/competitors",
      {
        params: { path: { community_id: communityId } },
      },
    );

    if (error) {
      return { success: false, message: "获取竞品列表失败" };
    }

    const items = extractApiData<CompetitorItem[]>(data);
    return { success: true, data: items || [], communityId };
  } catch (e) {
    logger.error("获取竞品列表异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 获取当前小区的竞品列表 (By Community ID)
 */
export async function getCompetitorsByCommunityAction(communityId: string) {
  try {
    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/monitor/communities/{community_id}/competitors",
      {
        params: { path: { community_id: communityId } },
      },
    );

    if (error) {
      return { success: false, message: "获取竞品列表失败" };
    }

    const items = extractApiData<CompetitorItem[]>(data);
    return { success: true, data: items || [], communityId };
  } catch (e) {
    logger.error("获取竞品列表异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 搜索小区
 */
export async function searchCommunitiesAction(keyword: string) {
  try {
    if (!keyword || keyword.trim().length < 2) {
      return { success: true, data: [] };
    }

    const client = await fetchClient();
    const { data: communitiesData, error } = await client.GET(
      "/api/v1/admin/communities",
      { params: { query: { search: keyword.trim(), page_size: 10 } } },
    );

    if (error) {
      return { success: false, message: "搜索失败" };
    }

    const { items } = extractPaginatedData<{ id: string; name: string }>(communitiesData);
    return { success: true, data: items || [] };
  } catch (e) {
    logger.error("搜索小区异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * 添加竞品小区
 */
export async function addCompetitorAction(
  communityId: string,
  competitorId: string,
) {
  try {
    const client = await fetchClient();
    const { error } = await client.POST(
      "/api/v1/monitor/communities/{community_id}/competitors",
      {
        params: { path: { community_id: communityId } },
        body: { competitor_community_id: competitorId },
      },
    );

    if (error) {
      return { success: false, message: "添加竞品失败" };
    }

    return { success: true };
  } catch (e) {
    logger.error("添加竞品异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * 删除竞品小区
 */
export async function removeCompetitorAction(
  communityId: string,
  competitorId: string,
) {
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE(
      "/api/v1/monitor/communities/{community_id}/competitors/{competitor_id}",
      {
        params: {
          path: { community_id: communityId, competitor_id: competitorId },
        },
      },
    );

    if (error) {
      return { success: false, message: "删除竞品失败" };
    }

    return { success: true };
  } catch (e) {
    logger.error("删除竞品异常:", e);
    return { success: false, message: "网络错误" };
  }
}
