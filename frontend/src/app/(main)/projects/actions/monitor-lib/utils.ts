import { fetchClient } from "@/lib/api-server";
import { getProjectDetailAction } from "../core";
import { extractPaginatedData } from "@/lib/api-helpers";

/**
 * 辅助函数: 从项目获取 community_id
 * @deprecated 直接使用 project 中的 community_id 字段，避免额外查询
 */
export async function getCommunityIdFromProject(
  projectId: string,
): Promise<string | null> {
  const projectResult = await getProjectDetailAction(projectId, false);
  if (!projectResult.success || !projectResult.data) return null;

  const communityName = projectResult.data.community_name;
  if (!communityName) return null;

  const client = await fetchClient();
  const { data: communitiesData, error } = await client.GET(
    "/api/v1/admin/communities",
    { params: { query: { search: communityName, page_size: 1 } } },
  );

  if (error) return null;

  const { items } = extractPaginatedData<{ id: string }>(communitiesData);
  return items?.[0]?.id || null;
}

/**
 * 辅助函数: 通过名称直接获取 community_id
 * @deprecated 直接使用 community_id 而非 community_name 调用API
 */
export async function getCommunityIdByName(
  communityName: string,
): Promise<string | null> {
  const client = await fetchClient();
  const { data: communitiesData, error } = await client.GET(
    "/api/v1/admin/communities",
    { params: { query: { search: communityName, page_size: 1 } } },
  );

  if (error) return null;

  const { items } = extractPaginatedData<{ id: string }>(communitiesData);
  return items?.[0]?.id || null;
}
