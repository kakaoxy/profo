"use server";

import { fetchClient } from "@/lib/api-server";
import { transformCommunitySearch } from "@/lib/api-transforms";

export async function searchCommunitiesAction(query: string) {
  const client = await fetchClient();
  const { data, error } = await client.GET(
    "/api/v1/properties/communities/search",
    {
      params: { query: { q: query } },
    },
  );

  if (error || !data) {
    console.error("Search communities error:", error);
    return [];
  }

  return transformCommunitySearch(data as Array<{
    id: string;
    name: string;
    district?: string;
    business_circle?: string;
  }>);
}
