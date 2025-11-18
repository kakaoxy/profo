import apiClient from './client'
import type { PropertyFilters, PropertyListResponse, Property } from './types'
import { normalizeStatus } from '@/utils/price'

/**
 * Fetch properties with filters and pagination
 */
export const fetchProperties = async (
  filters: PropertyFilters
): Promise<PropertyListResponse> => {
  const params: Record<string, any> = {}
  
  if (filters.status) params.status = filters.status
  if (filters.community_name) params.community_name = filters.community_name
  if (filters.districts && filters.districts.length > 0) {
    params.districts = filters.districts.join(',')
  }
  if (filters.business_circles && filters.business_circles.length > 0) {
    params.business_circles = filters.business_circles.join(',')
  }
  if (filters.orientations && filters.orientations.length > 0) {
    params.orientations = filters.orientations.join(',')
  }
  if (filters.floor_levels && filters.floor_levels.length > 0) {
    params.floor_levels = filters.floor_levels.join(',')
  }
  if (filters.min_price !== undefined) params.min_price = filters.min_price
  if (filters.max_price !== undefined) params.max_price = filters.max_price
  if (filters.min_area !== undefined) params.min_area = filters.min_area
  if (filters.max_area !== undefined) params.max_area = filters.max_area
  if (filters.rooms && filters.rooms.length > 0) {
    params.rooms = filters.rooms.join(',')
  }
  if (filters.rooms_gte !== undefined) params.rooms_gte = filters.rooms_gte
  if (filters.sort_by) params.sort_by = filters.sort_by
  if (filters.sort_order) params.sort_order = filters.sort_order
  if (filters.page) params.page = filters.page
  if (filters.page_size) params.page_size = filters.page_size
  
  const resp = await apiClient.get('/properties', { params }) as PropertyListResponse & { items: any[] }

  const coerceNumber = (val: any): number | undefined => {
    if (val === null || val === undefined) return undefined
    const n = typeof val === 'string' ? parseFloat(val) : val
    return Number.isFinite(n) ? n : undefined
  }

  const toWan = (val: any): number | undefined => coerceNumber(val)
  const toWanFromYuan = (val: any): number | undefined => {
    const n = coerceNumber(val)
    return n === undefined ? undefined : n / 10000
  }

  const mapItem = (raw: any): Property => {
    const statusNorm = normalizeStatus(raw.status)
    const listedWanCandidate = toWan(raw.listed_price_wan)
      ?? toWan(raw.listed_price)
      ?? toWanFromYuan(raw.listed_price_yuan)
      ?? toWan(raw.total_price_wan)
      ?? toWan(raw.total_price)

    const soldWanCandidate = toWan(raw.sold_price_wan)
      ?? toWan(raw.sold_price)
      ?? toWanFromYuan(raw.sold_price_yuan)
      ?? toWan(raw.deal_price_wan)
      ?? toWan(raw.deal_price)

    const listedWan = statusNorm === 'FOR_SALE' 
      ? (listedWanCandidate ?? toWan(raw.total_price)) 
      : listedWanCandidate
    const soldWan = statusNorm === 'SOLD' 
      ? (soldWanCandidate ?? toWan(raw.total_price)) 
      : soldWanCandidate

    const buildArea = coerceNumber(raw.build_area) ?? 0
    const unitPrice = coerceNumber(raw.unit_price) ?? (() => {
      const totalWan = statusNorm === 'FOR_SALE' ? listedWan : (soldWan ?? listedWan)
      if (totalWan && buildArea) return (totalWan * 10000) / buildArea
      return undefined
    })()

    return {
      ...raw,
      listed_price_wan: listedWan,
      sold_price_wan: soldWan,
      unit_price: unitPrice
    } as Property
  }

  return {
    ...resp,
    items: Array.isArray(resp.items) ? resp.items.map(mapItem) : []
  }
}

/**
 * Export properties as CSV
 */
export const exportProperties = async (filters: PropertyFilters): Promise<void> => {
  const params: Record<string, any> = {}
  
  if (filters.status) params.status = filters.status
  if (filters.community_name) params.community_name = filters.community_name
  if (filters.districts && filters.districts.length > 0) {
    params.districts = filters.districts.join(',')
  }
  if (filters.business_circles && filters.business_circles.length > 0) {
    params.business_circles = filters.business_circles.join(',')
  }
  if (filters.orientations && filters.orientations.length > 0) {
    params.orientations = filters.orientations.join(',')
  }
  if (filters.floor_levels && filters.floor_levels.length > 0) {
    params.floor_levels = filters.floor_levels.join(',')
  }
  if (filters.min_price !== undefined) params.min_price = filters.min_price
  if (filters.max_price !== undefined) params.max_price = filters.max_price
  if (filters.min_area !== undefined) params.min_area = filters.min_area
  if (filters.max_area !== undefined) params.max_area = filters.max_area
  if (filters.rooms && filters.rooms.length > 0) {
    params.rooms = filters.rooms.join(',')
  }
  if (filters.rooms_gte !== undefined) params.rooms_gte = filters.rooms_gte
  if (filters.sort_by) params.sort_by = filters.sort_by
  if (filters.sort_order) params.sort_order = filters.sort_order
  
  const response = await apiClient.get('/properties/export', {
    params,
    responseType: 'blob'
  })
  
  // Trigger download
  const url = window.URL.createObjectURL(new Blob([response as any]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', `properties_${Date.now()}.csv`)
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

/**
 * Fetch single property detail by id
 */
export const fetchPropertyDetail = async (id: number): Promise<Property> => {
  const raw = await apiClient.get(`/properties/${id}`) as any

  const coerceNumber = (val: any): number | undefined => {
    if (val === null || val === undefined) return undefined
    const n = typeof val === 'string' ? parseFloat(val) : val
    return Number.isFinite(n) ? n : undefined
  }

  const toWan = (val: any): number | undefined => coerceNumber(val)

  const statusNorm = normalizeStatus(raw.status)
  const listedWan = toWan(raw.listed_price_wan)
  const soldWan = toWan(raw.sold_price_wan)
  const buildArea = coerceNumber(raw.build_area) ?? 0
  const unitPrice = coerceNumber(raw.unit_price) ?? (() => {
    const totalWan = statusNorm === 'FOR_SALE' ? listedWan : (soldWan ?? listedWan)
    if (totalWan && buildArea) return (totalWan * 10000) / buildArea
    return undefined
  })()

  const mapped: Property = {
    ...raw,
    listed_price_wan: listedWan,
    sold_price_wan: soldWan,
    unit_price: unitPrice
  }

  return mapped
}
