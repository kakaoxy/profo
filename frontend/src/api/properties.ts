import apiClient from './client'
import type { PropertyFilters, PropertyListResponse } from './types'

/**
 * Fetch properties with filters and pagination
 */
export const fetchProperties = async (
  filters: PropertyFilters
): Promise<PropertyListResponse> => {
  const params: Record<string, any> = {}
  
  if (filters.status) params.status = filters.status
  if (filters.community_name) params.community_name = filters.community_name
  if (filters.min_price !== undefined) params.min_price = filters.min_price
  if (filters.max_price !== undefined) params.max_price = filters.max_price
  if (filters.min_area !== undefined) params.min_area = filters.min_area
  if (filters.max_area !== undefined) params.max_area = filters.max_area
  if (filters.rooms && filters.rooms.length > 0) {
    params.rooms = filters.rooms.join(',')
  }
  if (filters.sort_by) params.sort_by = filters.sort_by
  if (filters.sort_order) params.sort_order = filters.sort_order
  if (filters.page) params.page = filters.page
  if (filters.page_size) params.page_size = filters.page_size
  
  return apiClient.get('/properties', { params })
}

/**
 * Export properties as CSV
 */
export const exportProperties = async (filters: PropertyFilters): Promise<void> => {
  const params: Record<string, any> = {}
  
  if (filters.status) params.status = filters.status
  if (filters.community_name) params.community_name = filters.community_name
  if (filters.min_price !== undefined) params.min_price = filters.min_price
  if (filters.max_price !== undefined) params.max_price = filters.max_price
  if (filters.min_area !== undefined) params.min_area = filters.min_area
  if (filters.max_area !== undefined) params.max_area = filters.max_area
  if (filters.rooms && filters.rooms.length > 0) {
    params.rooms = filters.rooms.join(',')
  }
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
