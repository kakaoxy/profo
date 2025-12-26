"use server";

import { fetchClient } from "@/lib/api-server";
import { revalidatePath } from "next/cache";

export interface MergeResult {
  success: boolean;
  message?: string;
  affected_properties?: number;
}

interface ApiError {
  detail?: string;
  message?: string;
}

export async function mergeCommunitiesAction(
  primaryId: number,
  mergeIds: number[]
): Promise<MergeResult> {
  if (!primaryId || mergeIds.length === 0) {
    return { success: false, message: "参数错误：未选择主小区或被合并小区" };
  }

  try {
    const client = await fetchClient();
    const { data, error } = await client.POST("/api/v1/admin/communities/merge", {
      body: {
        primary_id: primaryId,
        merge_ids: mergeIds,
      },
    });

    if (error) {
      // 修复：使用类型断言代替 any
      const err = error as ApiError;
      const errorMsg = err.detail || err.message || "合并请求失败";
      return { success: false, message: errorMsg };
    }

    // 成功后刷新治理页面，让列表更新
    revalidatePath("/properties/governance");
    
    return { 
      success: true, 
      message: data.message,
      affected_properties: data.affected_properties 
    };

  } catch (e) {
    console.error("合并异常:", e);
    return { success: false, message: "网络错误，请稍后重试" };
  }
}