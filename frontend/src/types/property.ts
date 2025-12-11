// 房源状态枚举
export enum PropertyStatus {
  ON_SALE = '在售',
  SOLD = '成交'
}

// 楼层类型枚举
export enum FloorType {
  LOW = '低楼层',
  MIDDLE = '中楼层',
  HIGH = '高楼层'
}

// 房源基础信息接口
export interface Property {
  id: string;
  source_property_id: string;
  data_source: string;
  status: PropertyStatus;
  community_name: string;
  district?: string;
  business_circle?: string;
  rooms: number;
  halls?: number;
  bathrooms?: number;
  orientation: string;
  floor_info: string;
  total_floors?: number;
  current_floor?: number;
  area: number;
  interior_area?: number;
  list_price?: number; // 挂牌价（万）
  sold_price?: number; // 成交价（万）
  list_date?: string;
  sold_date?: string;
  property_type?: string;
  build_year?: number;
  building_structure?: string;
  decoration?: string;
  has_elevator?: boolean;
  property_nature?: string;
  property_years?: number;
  last_transaction?: string;
  heating_method?: string;
  description?: string;
  created_at: string;
  updated_at: string;
  images?: string[];
}

// 房源列表查询参数
export interface PropertyQueryParams {
  page?: number;
  page_size?: number;
  status?: string;
  community_name?: string;
  rooms?: number[];
  floor_type?: string[];
  min_price?: number;
  max_price?: number;
  min_area?: number;
  max_area?: number;
  district?: string[];
  business_circle?: string[];
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

// 房源列表响应
export interface PropertyListResponse {
  total: number;
  page: number;
  page_size: number;
  items: Property[];
}

// 筛选条件类型
export interface FilterState {
  status: string;
  community_name: string;
  rooms: number[];
  floor_type: string[];
  min_price: number | null;
  max_price: number | null;
  min_area: number | null;
  max_area: number | null;
  district: string[];
  business_circle: string[];
}

// 排序状态类型
export interface SortState {
  field: string;
  order: 'asc' | 'desc';
}