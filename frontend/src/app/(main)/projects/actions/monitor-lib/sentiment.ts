"use server";

import { fetchClient } from "@/lib/api-server";
import { getProjectDetailAction } from "../core";
import { MarketSentimentData, CommunityItem } from "./types";

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
    // console.log("[Monitor] Project community_name:", communityName);
    if (!communityName) {
      return { success: false, message: "项目未关联小区" };
    }

    // 2. 通过小区名称搜索获取 community_id
    const client = await fetchClient();
    const { data: communitiesData, error: communitiesError } = await client.GET(
      "/api/admin/communities",
      {
        params: { query: { search: communityName, page_size: 1 } },
      }
    );

    if (communitiesError || !communitiesData) {
      console.error("搜索小区失败:", communitiesError);
      return { success: false, message: "搜索小区信息失败" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const communities = (communitiesData as any).items as CommunityItem[];
    if (!communities || communities.length === 0) {
      return { success: false, message: `未找到小区: ${communityName}` };
    }

    const communityId = communities[0].id;
    // console.log("[Monitor] Found community_id:", communityId);

    // 3. 调用情绪 API
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const response = await fetch(
      `${baseUrl}/api/monitor/communities/${communityId}/sentiment`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      console.error("获取情绪数据失败:", response.status);
      return { success: false, message: "获取市场情绪数据失败" };
    }

    const sentimentData = (await response.json()) as MarketSentimentData;
    // console.log("[Monitor] Sentiment data received:", JSON.stringify(sentimentData, null, 2));
    return { success: true, data: sentimentData };
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

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const response = await fetch(
      `${baseUrl}/api/monitor/communities/${communityId}/sentiment`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      return { success: false, message: "获取市场情绪数据失败" };
    }

    const sentimentData = (await response.json()) as MarketSentimentData;
    return { success: true, data: sentimentData };
  } catch (e) {
    console.error("获取市场情绪异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
