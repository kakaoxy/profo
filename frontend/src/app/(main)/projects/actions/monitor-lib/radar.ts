"use server";

import { fetchClient } from "@/lib/api-server";
import { getProjectDetailAction } from "../core";
import { NeighborhoodRadarData } from "./types";

/**
 * 获取周边竞品雷达数据
 * 流程: projectId → community_id → radar API
 */
export async function getNeighborhoodRadarAction(projectId: string) {
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

    // 2. 调用雷达 API (使用 openapi-fetch client)
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

    // 直接返回数据，不再提取 .data
    return {
      success: true,
      data: radarData as NeighborhoodRadarData,
    };
  } catch (e) {
    console.error("获取周边竞品异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}

export async function getNeighborhoodRadarByCommunityAction(
  communityId: string,
) {
  try {
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

    // 直接返回数据，不再提取 .data
    return {
      success: true,
      data: radarData as NeighborhoodRadarData,
    };
  } catch (e) {
    console.error("获取周边竞品异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}
