"use server";

import { fetchClient } from "@/lib/api-server";
import { getProjectDetailAction } from "../core";
import { NeighborhoodRadarData, CommunityItem } from "./types";

/**
 * 获取周边竞品雷达数据
 * 流程: projectId → community_name → community_id → radar API
 */
export async function getNeighborhoodRadarAction(projectId: string) {
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

    // 3. 调用雷达 API
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const response = await fetch(
      `${baseUrl}/api/monitor/communities/${communityId}/radar`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      console.error("获取雷达数据失败:", response.status);
      return { success: false, message: "获取周边竞品数据失败" };
    }

    const radarData = (await response.json()) as NeighborhoodRadarData;
    return { success: true, data: radarData };
  } catch (e) {
    console.error("获取周边竞品异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

import { getCommunityIdByName } from "./utils";

export async function getNeighborhoodRadarByCommunityAction(communityName: string) {
  try {
    const communityId = await getCommunityIdByName(communityName);
    if (!communityId) {
      return { success: false, message: `未找到小区: ${communityName}` };
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    const response = await fetch(
      `${baseUrl}/api/monitor/communities/${communityId}/radar`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      return { success: false, message: "获取周边竞品数据失败" };
    }

    const radarData = (await response.json()) as NeighborhoodRadarData;
    return { success: true, data: radarData };
  } catch (e) {
    console.error("获取周边竞品异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
