/**
 * API 数据转换工具
 * 符合 Vercel React Best Practices: 在数据边界处理转换
 */

// ==================== 业务特定转换器 ====================

/**
 * 小区搜索响应（后端 snake_case → 前端 camelCase）
 */
export interface CommunitySearchItem {
  id: string;
  name: string;
  district?: string;
  businessCircle?: string;
}

/**
 * 转换小区搜索结果
 */
export function transformCommunitySearch(
  data: Array<{
    id: string;
    name: string;
    district?: string | null;
    business_circle?: string | null;
  }>
): CommunitySearchItem[] {
  return data.map(item => ({
    id: item.id,
    name: item.name,
    district: item.district ?? undefined,
    businessCircle: item.business_circle ?? undefined,
  }));
}
