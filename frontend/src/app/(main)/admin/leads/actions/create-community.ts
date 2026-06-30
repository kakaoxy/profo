"use server";

import { logger } from "@/lib/logger";
import { fetchClient } from "@/lib/api-server";
import { apiPaths } from "@/lib/config";

export interface CreateCommunityRequest {
  name: string;
  district?: string | null;
  business_circle?: string | null;
}

export interface CreateCommunityResponse {
  id: string;
  name: string;
  district: string | null;
  business_circle: string | null;
}

/**
 * 创建新小区
 * 如果小区已存在，则返回已存在的小区
 */
export async function createCommunityAction(
  data: CreateCommunityRequest
): Promise<CreateCommunityResponse | null> {
  try {
    const client = await fetchClient();
    const { data: result, error } = await client.POST(
      apiPaths.communities.base,
      {
        body: data,
      }
    );

    if (error || !result) {
      logger.error("Create community error:", error);
      return null;
    }

    return {
      id: result.id,
      name: result.name,
      district: result.district ?? null,
      business_circle: result.business_circle ?? null,
    };
  } catch (error) {
    logger.error("Create community error:", error);
    return null;
  }
}
