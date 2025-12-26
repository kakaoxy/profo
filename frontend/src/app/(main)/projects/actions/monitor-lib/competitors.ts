"use server";

import { fetchClient } from "@/lib/api-server";
import { CompetitorItem } from "./types";
import { getCommunityIdFromProject } from "./utils";

/**
 * 获取当前小区的竞品列表
 */
export async function getCompetitorsAction(projectId: string) {
  try {
    const communityId = await getCommunityIdFromProject(projectId);
    if (!communityId) {
      return { success: false, message: "获取小区信息失败" };
    }

    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/communities/{community_id}/competitors",
      {
        params: { path: { community_id: communityId } },
      }
    );

    if (error || !data) {
      return { success: false, message: "获取竞品列表失败" };
    }

    return { success: true, data: data as CompetitorItem[], communityId };
  } catch (e) {
    console.error("获取竞品列表异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

/**
 * 获取当前小区的竞品列表 (By Community Name)
 */
export async function getCompetitorsByCommunityAction(communityName: string) {
  try {
    const { getCommunityIdByName } = await import("./utils");
    const communityId = await getCommunityIdByName(communityName);
    
    if (!communityId) {
      return { success: false, message: "未找到该小区信息" };
    }

    const client = await fetchClient();
    const { data, error } = await client.GET(
      "/api/v1/communities/{community_id}/competitors",
      {
        params: { path: { community_id: communityId } },
      }
    );

    if (error || !data) {
      return { success: false, message: "获取竞品列表失败" };
    }

    return { success: true, data: data as CompetitorItem[], communityId };
  } catch (e) {
    console.error("获取竞品列表异常:", e);
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
      { params: { query: { search: keyword.trim(), page_size: 10 } } }
    );

    if (error || !communitiesData) {
      return { success: false, message: "搜索失败" };
    }

    const items = communitiesData.items;
    return { success: true, data: items || [] };
  } catch (e) {
    console.error("搜索小区异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * 添加竞品小区
 */
export async function addCompetitorAction(communityId: number, competitorId: number) {
  try {
    const client = await fetchClient();
    const { error } = await client.POST(
      "/api/v1/communities/{community_id}/competitors",
      {
        params: { path: { community_id: communityId } },
        body: { competitor_community_id: competitorId },
      }
    );

    if (error) {
      return { success: false, message: "添加竞品失败" };
    }

    return { success: true };
  } catch (e) {
    console.error("添加竞品异常:", e);
    return { success: false, message: "网络错误" };
  }
}

/**
 * 删除竞品小区
 */
export async function removeCompetitorAction(communityId: number, competitorId: number) {
  try {
    const client = await fetchClient();
    const { error } = await client.DELETE(
      "/api/v1/communities/{community_id}/competitors/{competitor_id}",
      {
        params: { path: { community_id: communityId, competitor_id: competitorId } },
      }
    );

    if (error) {
      return { success: false, message: "删除竞品失败" };
    }

    return { success: true };
  } catch (e) {
    console.error("删除竞品异常:", e);
    return { success: false, message: "网络错误" };
  }
}
