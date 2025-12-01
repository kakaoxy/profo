import apiClient from './client'
import type {
  Project,
  CashFlowRecord
} from '../components/project_management/types'

// Backend BaseResponse wrapper
interface BaseResponse<T = any> {
  code: number
  msg: string
  data: T
}

// ========== 项目基础操作 ==========

/**
 * 获取项目列表
 */
export const fetchProjects = async (params?: {
  status?: string
  community_name?: string
  page?: number
  page_size?: number
}): Promise<{ items: Project[]; total: number; page: number; page_size: number }> => {
  const response = await apiClient.get('/v1/projects', { params }) as BaseResponse<{ items: Project[]; total: number; page: number; page_size: number }>
  return response.data
}

/**
 * 获取项目统计
 */
export const fetchProjectStats = async (): Promise<{ signing: number; renovating: number; selling: number; sold: number }> => {
  const response = await apiClient.get('/v1/projects/stats')
  return response.data
}

/**
 * 获取项目详情
 */
export const fetchProject = async (projectId: string): Promise<Project> => {
  const response = await apiClient.get(`/v1/projects/${projectId}`)
  return response.data
}

/**
 * 创建项目
 */
export const createProject = async (projectData: Partial<Project>): Promise<Project> => {
  const response = await apiClient.post('/v1/projects', projectData) as BaseResponse<Project>
  console.log('[API] Create project response:', response)
  return response.data
}

/**
 * 更新项目
 */
export const updateProject = async (projectId: string, updates: Partial<Project>): Promise<Project> => {
  const response = await apiClient.put(`/v1/projects/${projectId}`, updates) as BaseResponse<Project>
  console.log('[API] Update project response:', response)
  return response.data
}

// ========== 文件上传 ==========

/**
 * 上传通用文件
 */
export const uploadFile = async (file: File): Promise<{ url: string; filename: string }> => {
  const formData = new FormData()
  formData.append('file', file)
  const response = await apiClient.post('/v1/files/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  }) as BaseResponse<{ url: string; filename: string }>
  return response.data
}

// ========== 项目状态流转 ==========

/**
 * 更新项目状态
 */
export const updateProjectStatus = async (projectId: string, status: string): Promise<Project> => {
  const response = await apiClient.put(`/v1/projects/${projectId}/status`, { status })
  return response.data
}

/**
 * 完成项目（标记为已售）
 */
export const completeProject = async (projectId: string, data: {
  sold_price: number
  sold_date: string
}): Promise<Project> => {
  const response = await apiClient.post(`/v1/projects/${projectId}/complete`, data)
  return response.data
}

// ========== 改造阶段管理 ==========

/**
 * 更新改造阶段
 */
export const updateRenovationStage = async (projectId: string, data: {
  renovation_stage: string
  stage_completed_at?: string
}): Promise<Project> => {
  const response = await apiClient.put(`/v1/projects/${projectId}/renovation`, data)
  return response.data
}

/**
 * 上传改造照片
 */
export const uploadRenovationPhoto = async (
  projectId: string,
  stage: string,
  url: string,
  filename?: string,
  description?: string
): Promise<any> => {
  const params = new URLSearchParams({ stage, url })
  if (filename) params.append('filename', filename)
  if (description) params.append('description', description)

  const response = await apiClient.post(
    `/v1/projects/${projectId}/renovation/photos?${params.toString()}`
  )
  return response.data
}

/**
 * 获取改造照片
 */
export const fetchRenovationPhotos = async (
  projectId: string,
  stage?: string
): Promise<any[]> => {
  const params = stage ? { stage } : undefined
  const response = await apiClient.get(
    `/v1/projects/${projectId}/renovation/photos`,
    { params }
  )
  return response.data
}

// ========== 销售管理 ==========

/**
 * 更新销售角色
 */
export const updateSalesRoles = async (projectId: string, roles: {
  property_agent?: string
  client_agent?: string
  first_viewer?: string
}): Promise<Project> => {
  const response = await apiClient.put(`/v1/projects/${projectId}/selling/roles`, roles)
  return response.data
}

/**
 * 创建销售记录
 */
export const createSalesRecord = async (
  projectId: string,
  recordData: any
): Promise<any> => {
  const endpoint = `/v1/projects/${projectId}/selling/${recordData.record_type}s`
  const response = await apiClient.post(endpoint, recordData)
  return response.data
}

/**
 * 获取销售记录
 */
export const fetchSalesRecords = async (
  projectId: string,
  recordType?: string
): Promise<any[]> => {
  const params = recordType ? { record_type: recordType } : undefined
  const response = await apiClient.get(
    `/v1/projects/${projectId}/selling/records`,
    { params }
  )
  return response.data
}

/**
 * 删除销售记录
 */
export const deleteSalesRecord = async (projectId: string, recordId: string): Promise<void> => {
  await apiClient.delete(`/v1/projects/${projectId}/selling/records/${recordId}`)
}

// ========== 现金流管理 ==========

/**
 * 创建现金流记录
 */
export const createCashFlowRecord = async (
  projectId: string,
  recordData: {
    type: 'income' | 'expense'
    category: string
    amount: number
    date: string
    description?: string
    related_stage?: string
  }
): Promise<CashFlowRecord> => {
  const response = await apiClient.post(`/v1/projects/${projectId}/cashflow`, recordData)
  return response.data
}

/**
 * 获取项目现金流
 */
export const fetchProjectCashFlow = async (projectId: string): Promise<{
  records: CashFlowRecord[]
  summary: {
    total_income: number
    total_expense: number
    net_cash_flow: number
    roi: number
  }
}> => {
  const response = await apiClient.get(`/v1/projects/${projectId}/cashflow`)
  return response.data
}

/**
 * 删除现金流记录
 */
export const deleteCashFlowRecord = async (recordId: string, projectId: string): Promise<void> => {
  await apiClient.delete(`/v1/cashflow/${recordId}?project_id=${projectId}`)
}

// ========== 项目报告 ==========

/**
 * 获取项目报告
 */
export const fetchProjectReport = async (projectId: string): Promise<any> => {
  const response = await apiClient.get(`/v1/projects/${projectId}/report`)
  return response.data
}

// ========== 数据导出 ==========

/**
 * 导出项目数据
 */
export const exportProjects = async (params?: {
  status?: string
  community_name?: string
}): Promise<any> => {
  const response = await apiClient.get('/v1/projects/export', { params })
  return response.data
}
