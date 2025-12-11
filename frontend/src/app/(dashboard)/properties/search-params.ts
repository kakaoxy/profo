import { parseAsInteger, parseAsString, createSearchParamsCache } from "nuqs/server";

// 定义 URL 参数的解析规则
export const searchParamsParsers = {
  page: parseAsInteger.withDefault(1),
  page_size: parseAsInteger.withDefault(50),
  q: parseAsString.withDefault(""), // 小区名搜索
  status: parseAsString.withDefault(""), // 状态
  rooms: parseAsString.withDefault(""), // 户型 (逗号分隔)
  floor_levels: parseAsString.withDefault(""), // 楼层
  min_price: parseAsInteger,
  max_price: parseAsInteger,
  min_area: parseAsInteger,
  max_area: parseAsInteger,
  districts: parseAsString.withDefault(""), // 行政区 (逗号分隔)
  business_circles: parseAsString.withDefault(""), // 商圈
  sort_by: parseAsString.withDefault("updated_at"),
  sort_order: parseAsString.withDefault("desc"),
};

// 创建服务端缓存（用于 page.tsx 读取）
export const searchParamsCache = createSearchParamsCache(searchParamsParsers);