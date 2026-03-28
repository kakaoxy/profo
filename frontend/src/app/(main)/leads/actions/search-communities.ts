"use server";

import { fetchClient } from "@/lib/api-server";

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

  return data as {
    id: number;
    name: string;
    district: string;
    businessCircle: string;
  }[];
}
