// API request and response types

export interface PropertyFilters {
  status?: '在售' | '成交' | null
  community_name?: string
  districts?: string[]
  business_circles?: string[]
  orientations?: string[]
  floor_levels?: string[]
  min_price?: number
  max_price?: number
  min_area?: number
  max_area?: number
  rooms?: number[]
  rooms_gte?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
  page?: number
  page_size?: number
}

export interface Property {
  id: number
  data_source: string
  source_property_id: string
  status: string
  community_name: string
  district?: string
  business_circle?: string
  layout_display?: string
  rooms: number
  halls: number
  baths: number
  orientation: string
  floor_original: string
  floor_display?: string
  floor_number?: number
  total_floors?: number
  floor_level?: string
  build_area: number
  inner_area?: number
  listed_price_wan?: number
  sold_price_wan?: number
  unit_price?: number
  listed_date?: string
  sold_date?: string
  transaction_duration_days?: number
  transaction_duration_display?: string
  discount_rate_display?: string
  property_type?: string
  build_year?: number
  building_structure?: string
  decoration?: string
  elevator?: boolean
  ownership_type?: string
  ownership_years?: number
  last_transaction?: string
  heating_method?: string
  mortgage_info?: string
  listing_remarks?: string
  floor_plan_url?: string
  created_at: string
  updated_at: string
}

export interface PropertyListResponse {
  total: number
  page: number
  page_size: number
  items: Property[]
}

export interface UploadResult {
  total: number
  success: number
  failed: number
  failed_file_url?: string
}

export interface Community {
  id: number
  name: string
  property_count: number
  district?: string
  business_circle?: string
  avg_price_wan?: number
}

export interface CommunityListResponse {
  total: number
  items: Community[]
}

export interface MergeResult {
  success: boolean
  affected_properties: number
  message: string
}

export interface DictionaryResponse {
  type: 'district' | 'business_circle'
  items: string[]
}
