"use server";

import { fetchClient } from "@/lib/api-server";
import { getProjectDetailAction } from "../core";
import { NeighborhoodRadarData } from "./types";
import { components } from "@/lib/api-types";

type ApiResponse_Radar = components["schemas"]["ApiResponse_NeighborhoodRadarResponse_"];

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
      "/api/v1/admin/communities",
      {
        params: { query: { search: communityName, page_size: 1 } },
      },
    );

    if (communitiesError || !communitiesData) {
      return { success: false, message: "搜索小区信息失败" };
    }

    const communitiesWrapper = communitiesData as {
      data?: { items?: Array<{ id: number }> };
    };
    const communities = communitiesWrapper.data?.items;
    if (!communities || communities.length === 0) {
      return { success: false, message: `未找到小区: ${communityName}` };
    }

    const communityId = communities[0].id;

    // 3. 调用雷达 API (使用 openapi-fetch client)
    const { data: radarData, error: radarError } = await client.GET(
      "/api/v1/monitor/communities/{community_id}/radar",
      {
        params: { path: { community_id: communityId } },
      },
    );

    if (radarError || !radarData) {
      return { success: false, message: "获取周边竞品数据失败" };
    }

    return {
      success: true,
      data: (radarData as ApiResponse_Radar)?.data as NeighborhoodRadarData,
    };
  } catch (e) {
    console.error("获取周边竞品异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

import { getCommunityIdByName } from "./utils";

export async function getNeighborhoodRadarByCommunityAction(
  communityName: string,
) {
  try {
    const communityId = await getCommunityIdByName(communityName);
    if (!communityId) {
      return { success: false, message: `未找到小区: ${communityName}` };
    }

    const client = await fetchClient();
    const { data: radarData, error: radarError } = await client.GET(
      "/api/v1/monitor/communities/{community_id}/radar",
      {
        params: { path: { community_id: communityId } },
      },
    );

    if (radarError || !radarData) {
      return { success: false, message: "获取周边竞品数据失败" };
    }

    return {
      success: true,
      data: (radarData as ApiResponse_Radar)?.data as NeighborhoodRadarData,
    };
  } catch (e) {
    console.error("获取周边竞品异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
