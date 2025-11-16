import apiClient from './client'
import type { CommunityListResponse, MergeResult } from './types'

/**
 * Fetch communities with optional search
 */
export const fetchCommunities = async (
  search?: string,
  page: number = 1,
  pageSize: number = 50
): Promise<CommunityListResponse> => {
  return apiClient.get('/admin/communities', {
    params: {
      search,
      page,
      page_size: pageSize
    }
  })
}

/**
 * Merge multiple communities into one primary community
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
