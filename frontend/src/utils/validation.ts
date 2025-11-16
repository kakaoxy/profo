import { useToast } from '@/composables/useToast'

const { showWarningToast, showErrorToast } = useToast()

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean
  message?: string
}

/**
 * Validate file upload
 */
export const validateFileUpload = (file: File | null): ValidationResult => {
  if (!file) {
    showWarningToast('请选择要上传的文件')
    return { valid: false, message: '请选择要上传的文件' }
  }

  // Check file type
  const allowedTypes = ['.csv', 'text/csv', 'application/vnd.ms-excel']
  const fileExtension = file.name.toLowerCase().split('.').pop()
  
  if (fileExtension !== 'csv' && !allowedTypes.includes(file.type)) {
    showErrorToast('只支持 CSV 格式文件')
    return { valid: false, message: '只支持 CSV 格式文件' }
  }

  // Check file size (max 50MB)
  const maxSize = 50 * 1024 * 1024
  if (file.size > maxSize) {
    showErrorToast('文件大小不能超过 50MB')
    return { valid: false, message: '文件大小不能超过 50MB' }
  }

  // Check if file is empty
  if (file.size === 0) {
    showErrorToast('文件不能为空')
    return { valid: false, message: '文件不能为空' }
  }

  return { valid: true }
}

/**
 * Validate community merge operation
 */
export const validateCommunityMerge = (
  selectedCommunities: any[],
  primaryId: number | null
): ValidationResult => {
  if (selectedCommunities.length < 2) {
    showWarningToast('请至少选择 2 个小区进行合并')
    return { valid: false, message: '请至少选择 2 个小区进行合并' }
  }

  if (!primaryId) {
    showWarningToast('请指定主记录（选择一个小区作为保留的记录）')
    return { valid: false, message: '请指定主记录' }
  }

  // Check if primary ID is in selected communities
  const isPrimaryInSelected = selectedCommunities.some(c => c.id === primaryId)
  if (!isPrimaryInSelected) {
    showErrorToast('主记录必须是已选择的小区之一')
    return { valid: false, message: '主记录必须是已选择的小区之一' }
  }

  return { valid: true }
}

/**
 * Validate filter values
 */
export const validateFilterValues = (filters: {
  minPrice?: number
  maxPrice?: number
  minArea?: number
  maxArea?: number
}): ValidationResult => {
  // Validate price range
  if (filters.minPrice !== undefined && filters.maxPrice !== undefined) {
    if (filters.minPrice < 0) {
      showWarningToast('最低价格不能为负数')
      return { valid: false, message: '最低价格不能为负数' }
    }
    
    if (filters.maxPrice < 0) {
      showWarningToast('最高价格不能为负数')
      return { valid: false, message: '最高价格不能为负数' }
    }
    
    if (filters.minPrice > filters.maxPrice) {
      showWarningToast('最低价格不能大于最高价格')
      return { valid: false, message: '最低价格不能大于最高价格' }
    }
  }

  // Validate area range
  if (filters.minArea !== undefined && filters.maxArea !== undefined) {
    if (filters.minArea < 0) {
      showWarningToast('最小面积不能为负数')
      return { valid: false, message: '最小面积不能为负数' }
    }
    
    if (filters.maxArea < 0) {
      showWarningToast('最大面积不能为负数')
      return { valid: false, message: '最大面积不能为负数' }
    }
    
    if (filters.minArea > filters.maxArea) {
      showWarningToast('最小面积不能大于最大面积')
      return { valid: false, message: '最小面积不能大于最大面积' }
    }
  }

  return { valid: true }
}

/**
 * Validate search query
 */
export const validateSearchQuery = (query: string): ValidationResult => {
  if (query.length > 100) {
    showWarningToast('搜索关键词不能超过 100 个字符')
    return { valid: false, message: '搜索关键词不能超过 100 个字符' }
  }

  return { valid: true }
}

/**
 * Validate pagination parameters
 */
export const validatePagination = (page: number, pageSize: number): ValidationResult => {
  if (page < 1) {
    showWarningToast('页码必须大于 0')
    return { valid: false, message: '页码必须大于 0' }
  }

  if (pageSize < 1 || pageSize > 200) {
    showWarningToast('每页数量必须在 1-200 之间')
    return { valid: false, message: '每页数量必须在 1-200 之间' }
  }

  return { valid: true }
}

/**
 * Generic validation helper
 */
export const validate = (
  condition: boolean,
  errorMessage: string,
  type: 'warning' | 'error' = 'warning'
): ValidationResult => {
  if (!condition) {
    if (type === 'warning') {
      showWarningToast(errorMessage)
    } else {
      showErrorToast(errorMessage)
    }
    return { valid: false, message: errorMessage }
  }
  return { valid: true }
}
