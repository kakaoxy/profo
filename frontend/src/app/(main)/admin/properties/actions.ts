"use server";

import { fetchClient } from "@/lib/api-server";

export async function getPropertyDetailAction(id: number) {
  const client = await fetchClient();
  // 在服务端发起请求，Cookie 会自动带上
  const { data, error } = await client.GET("/api/v1/properties/{property_id}", {
    params: {
      path: { property_id: id }
    }
  });

  if (error) {
    throw new Error("获取详情失败");
  }

  return data;
}