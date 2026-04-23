/**
 * API 数据转换工具
 * 符合 Vercel React Best Practices: 在数据边界处理转换
 */

import { z } from "zod";

// ==================== Zod 验证 Schema ====================

/**
 * 小区搜索后端响应 Schema
 */
const CommunitySearchResponseSchema = z.array(
  z.object({
    id: z.string(),
    name: z.string(),
    district: z.string().nullable().optional(),
    business_circle: z.string().nullable().optional(),
  })
);

// ==================== 类型定义 ====================

/**
 * 小区搜索后端响应（snake_case）
 */
export type CommunitySearchResponse = z.infer<
  typeof CommunitySearchResponseSchema
>;

/**
 * 小区搜索响应（后端 snake_case → 前端 camelCase）
 */
export interface CommunitySearchItem {
  id: string;
  name: string;
  district?: string;
  businessCircle?: string;
}

// ==================== 业务特定转换器 ====================

/**
 * 转换小区搜索结果
 * @param data - 后端返回的原始数据
 * @returns 转换后的前端格式数据
 * @throws 当数据验证失败时抛出错误
 */
export function transformCommunitySearch(
  data: unknown
): CommunitySearchItem[] {
  // 1. 验证输入数据
  const validated = CommunitySearchResponseSchema.safeParse(data);

  if (!validated.success) {
    throw new Error(
      `CommunitySearch 数据验证失败: ${validated.error.message}`
    );
  }

  // 2. 转换数据格式
  return validated.data.map((item) => ({
    id: item.id,
    name: item.name,
    district: item.district ?? undefined,
    businessCircle: item.business_circle ?? undefined,
  }));
}

/**
 * 安全转换小区搜索结果（不抛出错误）
 * @param data - 后端返回的原始数据
 * @returns 转换后的前端格式数据，验证失败返回空数组
 */
export function transformCommunitySearchSafe(
  data: unknown
): CommunitySearchItem[] {
  try {
    return transformCommunitySearch(data);
  } catch {
    return [];
  }
}
