import type { components } from "@/lib/api-types";

/**
 * CommunityResponse 完整类型（来自 OpenAPI 生成）
 */
export type Community = components["schemas"]["CommunityResponse"];

/**
 * 前端 governance 视图实际使用的字段集合（RSC → 客户端组件序列化精简）。
 * 规则: server-serialization（最小化传给客户端组件的数据）
 *
 * 提取为纯函数以便单元测试验证字段映射等价性。
 */
export interface CommunityMinified {
  id: Community["id"];
  name: Community["name"];
  district: Community["district"];
  business_circle: Community["business_circle"];
  total_properties: Community["total_properties"];
  is_active: boolean;
  created_at: Community["created_at"];
  aliases: { id: string; alias_name: string; data_source: string; created_at: string }[];
}

/**
 * 从完整 CommunityResponse 中提取前端实际使用的字段。
 * 剔除：city_id、avg_price_wan（前端无任何引用）。
 *
 * is_active 当前 CommunityResponse 未暴露，列表查询已过滤 is_active=True，
 * 故此处硬编码为 true。
 */
export function pickCommunityFields(c: Community): CommunityMinified {
  return {
    id: c.id,
    name: c.name,
    district: c.district,
    business_circle: c.business_circle,
    total_properties: c.total_properties,
    is_active: true,
    created_at: c.created_at,
    aliases: c.aliases ?? [],
  };
}
