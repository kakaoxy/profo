"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { getProjectDetailAction } from "../core";
import { MarketSentimentData } from "./types";

/**
 * 获取市场情绪数据
 * 流程: projectId → community_id → sentiment API
 */
export async function getMarketSentimentAction(projectId: string) {
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
 
    // 2. 调用情绪 API (使用 openapi-fetch client)
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

    // 直接返回数据，不再提取 .data
    return { success: true, data: sentimentData as MarketSentimentData };
  } catch (e) {
    logger.error("获取市场情绪异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function getMarketSentimentByCommunityAction(communityId: string) {
  try {
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

    // 直接返回数据，不再提取 .data
    return { success: true, data: sentimentData as MarketSentimentData };
  } catch (e) {
    logger.error("获取市场情绪异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
