"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { getProjectDetailAction } from "../core";
import { TrendData } from "./types";

/**
 * 获取价格走势数据
 * 流程: projectId → community_id → trends API
 */
export async function getTrendPositioningAction(projectId: string) {
  try {
    // 1. 获取项目详情
    const projectResult = await getProjectDetailAction(projectId, true);
    if (!projectResult.success || !projectResult.data) {
      return { success: false, message: "获取项目信息失败" };
    }

    const { community_id, list_price, signing_price, area } = projectResult.data;
    
    // 计算我的单价 (优先使用挂牌价，其次使用签约价)
    let myPrice = 0;
    const price = list_price || signing_price;
    if (price && area) {
      // 价格单位是万，面积是平米，结果需要转换为元/平米
      // (price * 10000) / area
      myPrice = Math.round((Number(price) * 10000) / Number(area));
    }

    if (!community_id) {
      return { success: false, message: "项目未关联小区" };
    }

    // 2. 调用 Trend API (使用 openapi-fetch client)
    const client = await fetchClient();
    const { data: trendData, error: trendError } = await client.GET(
      "/api/v1/monitor/communities/{community_id}/trends",
      {
        params: { path: { community_id: community_id } },
      }
    );

    if (trendError || !trendData) {
      return { success: false, message: "获取走势数据失败" };
    }

    // 直接返回数据，trendData 已经是 TrendData[]
    return { success: true, data: trendData as TrendData[], myPrice };
  } catch (e) {
    logger.error("获取价格走势异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function getTrendPositioningByCommunityAction(communityId: string, myPrice: number) {
  try {
    const client = await fetchClient();
    const { data: trendData, error: trendError } = await client.GET(
      "/api/v1/monitor/communities/{community_id}/trends",
      {
        params: { path: { community_id: communityId } },
      }
    );

    if (trendError || !trendData) {
      return { success: false, message: "获取走势数据失败" };
    }

    // 直接返回数据，trendData 已经是 TrendData[]
    return { success: true, data: trendData as TrendData[], myPrice };
  } catch (e) {
    logger.error("获取价格走势异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
