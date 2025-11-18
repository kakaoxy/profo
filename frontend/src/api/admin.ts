import apiClient from './client'
import type { CommunityListResponse, MergeResult, DictionaryResponse } from './types'

/**
 * Fetch communities with search
 */
export const fetchCommunities = async (
  search?: string,
  page: number = 1,
  pageSize: number = 50
): Promise<CommunityListResponse> => {
  const params: Record<string, any> = {
    page,
    page_size: pageSize
  }
  
  if (search) {
    params.search = search
  }
  
  return apiClient.get('/admin/communities', { params })
}

/**
 * Merge communities
 */
export const mergeCommunities = async (
  primaryId: number,
  mergeIds: number[]
): Promise<MergeResult> => {
  return apiClient.post('/admin/communities/merge', {
    primary_id: primaryId,
    merge_ids: mergeIds
  })
}

/**
 * Fetch dictionaries for districts or business circles
 */
export const fetchDictionary = async (
  type: 'district' | 'business_circle',
  search?: string,
  limit: number = 50
): Promise<DictionaryResponse> => {
  const params: Record<string, any> = { type, limit }
  if (search) params.search = search
  return apiClient.get('/admin/dictionaries', { params })
}
