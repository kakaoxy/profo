import { fetchClient } from "@/lib/api-server";
import { getProjectDetailAction } from "../core";


/**
 * 辅助函数: 从项目获取 community_id
 */
export async function getCommunityIdFromProject(projectId: string): Promise<number | null> {
  const projectResult = await getProjectDetailAction(projectId, false);
  if (!projectResult.success || !projectResult.data) return null;

  const communityName = projectResult.data.community_name;
  if (!communityName) return null;

  const client = await fetchClient();
  const { data: communitiesData, error } = await client.GET(
    "/api/admin/communities",
    { params: { query: { search: communityName, page_size: 1 } } }
  );

  if (error || !communitiesData) return null;

  const communities = communitiesData.items;
  return communities?.[0]?.id || null;
}

/**
 * 辅助函数: 通过名称直接获取 community_id
 */
export async function getCommunityIdByName(communityName: string): Promise<number | null> {
  const client = await fetchClient();
  const { data: communitiesData, error } = await client.GET(
    "/api/admin/communities",
    { params: { query: { search: communityName, page_size: 1 } } }
  );

  if (error || !communitiesData) return null;

  const communities = communitiesData.items;
  return communities?.[0]?.id || null;
}
