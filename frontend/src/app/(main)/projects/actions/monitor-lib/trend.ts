"use server";

import { fetchClient } from "@/lib/api-server";
import { getProjectDetailAction } from "../core";
import { TrendData, CommunityItem } from "./types";

/**
 * 获取价格走势数据
 */
export async function getTrendPositioningAction(projectId: string) {
  try {
    // 1. 获取项目详情
    const projectResult = await getProjectDetailAction(projectId, true);
    if (!projectResult.success || !projectResult.data) {
      return { success: false, message: "获取项目信息失败" };
    }

    const { community_name, list_price, signing_price, area } = projectResult.data;
    
    // 计算我的单价 (优先使用挂牌价，其次使用签约价)
    let myPrice = 0;
    const price = list_price || signing_price;
    if (price && area) {
      // 价格单位是万，面积是平米，结果需要转换为元/平米
      // (price * 10000) / area
      myPrice = Math.round((Number(price) * 10000) / Number(area));
    }

    if (!community_name) {
      return { success: false, message: "项目未关联小区" };
    }

    // 2. 获取 community_id
    const client = await fetchClient();
    const { data: communitiesData, error: communitiesError } = await client.GET(
      "/api/admin/communities",
      {
        params: { query: { search: community_name, page_size: 1 } },
      }
    );

    if (communitiesError || !communitiesData) {
      return { success: false, message: "搜索小区信息失败" };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const communities = (communitiesData as any).items as CommunityItem[];
    if (!communities || communities.length === 0) {
      return { success: false, message: `未找到小区: ${community_name}` };
    }
    const communityId = communities[0].id;

    // 3. 调用 Trend API
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const response = await fetch(
      `${baseUrl}/api/monitor/communities/${communityId}/trends`,
      { cache: "no-store" } // 确保获取最新数据
    );

    if (!response.ok) {
      console.error("获取走势数据失败:", response.status);
      return { success: false, message: "获取走势数据失败" };
    }

    const trendData = (await response.json()) as TrendData[];
    return { success: true, data: trendData, myPrice };
  } catch (e) {
    console.error("获取价格走势异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

import { getCommunityIdByName } from "./utils";

export async function getTrendPositioningByCommunityAction(communityName: string, myPrice: number) {
  try {
    const communityId = await getCommunityIdByName(communityName);
    if (!communityId) {
      return { success: false, message: `未找到小区: ${communityName}` };
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const response = await fetch(
      `${baseUrl}/api/monitor/communities/${communityId}/trends`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      return { success: false, message: "获取走势数据失败" };
    }

    const trendData = (await response.json()) as TrendData[];
    return { success: true, data: trendData, myPrice };
  } catch (e) {
    console.error("获取价格走势异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
