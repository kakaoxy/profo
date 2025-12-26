"use server";

import { fetchClient } from "@/lib/api-server";
import { getProjectDetailAction } from "../core";
import { MarketSentimentData } from "./types";

/**
 * 获取市场情绪数据
 * 流程: projectId → community_name → community_id → sentiment API
 */
export async function getMarketSentimentAction(projectId: string) {
  try {
    // 1. 获取项目详情，提取 community_name
    const projectResult = await getProjectDetailAction(projectId, false);
    if (!projectResult.success || !projectResult.data) {
      return { success: false, message: "获取项目信息失败" };
    }

    const communityName = projectResult.data.community_name;
    if (!communityName) {
      return { success: false, message: "项目未关联小区" };
    }

    // 2. 通过小区名称搜索获取 community_id
    const client = await fetchClient();
    const { data: communitiesData, error: communitiesError } = await client.GET(
      "/api/v1/admin/communities",
      {
        params: { query: { search: communityName, page_size: 1 } },
      }
    );

    if (communitiesError || !communitiesData) {
      console.error("搜索小区失败:", communitiesError);
      return { success: false, message: "搜索小区信息失败" };
    }

    const communities = communitiesData.items;
    if (!communities || communities.length === 0) {
      return { success: false, message: `未找到小区: ${communityName}` };
    }

    const communityId = communities[0].id;

    // 3. 调用情绪 API (使用 openapi-fetch client)
    const { data: sentimentData, error: sentimentError } = await client.GET(
      "/api/v1/monitor/communities/{community_id}/sentiment",
      {
        params: { path: { community_id: communityId } },
      }
    );

    if (sentimentError || !sentimentData) {
      console.error("获取情绪数据失败:", sentimentError);
      return { success: false, message: "获取市场情绪数据失败" };
    }

    return { success: true, data: sentimentData as MarketSentimentData };
  } catch (e) {
    console.error("获取市场情绪异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

import { getCommunityIdByName } from "./utils";

export async function getMarketSentimentByCommunityAction(communityName: string) {
  try {
    const communityId = await getCommunityIdByName(communityName);
    if (!communityId) {
      return { success: false, message: `未找到小区: ${communityName}` };
    }

    const client = await fetchClient();
    const { data: sentimentData, error: sentimentError } = await client.GET(
      "/api/v1/monitor/communities/{community_id}/sentiment",
      {
        params: { path: { community_id: communityId } },
      }
    );

    if (sentimentError || !sentimentData) {
      return { success: false, message: "获取市场情绪数据失败" };
    }

    return { success: true, data: sentimentData as MarketSentimentData };
  } catch (e) {
    console.error("获取市场情绪异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
