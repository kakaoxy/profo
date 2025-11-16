import apiClient from './client'
import type { UploadResult } from './types'

/**
 * Upload CSV file
 */
export const uploadCSV = async (
  file: File,
  onProgress?: (percent: number) => void
): Promise<UploadResult> => {
  const formData = new FormData()
  formData.append('file', file)
  
  return apiClient.post('/upload/csv', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        onProgress(percent)
      }
    }
  })
}
