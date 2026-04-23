/**
 * 项目选择器组件类型定义
 */

// ============================================================================
// L3 项目类型
// ============================================================================

export interface L3ProjectBrief {
  /** 项目ID */
  id: string;
  /** 项目名称 */
  name: string;
  /** 小区名称 */
  community_name: string;
  /** 物业地址 */
  address: string;
  /** 面积(m²) */
  area?: number;
  /** 户型 */
  layout?: string;
  /** 朝向 */
  orientation?: string;
  /** 项目状态 */
  status: string;
}

export interface L3ProjectListResponse {
  /** 项目列表 */
  items: L3ProjectBrief[];
  /** 总记录数 */
  total: number;
  /** 当前页码 */
  page: number;
  /** 每页大小 */
  page_size: number;
}

// ============================================================================
// 可导入媒体资源类型
// ============================================================================

export interface ImportableMedia {
  /** 媒体ID */
  id: string;
  /** 文件URL */
  file_url: string;
  /** 缩略图URL */
  thumbnail_url?: string;
  /** 照片分类 */
  photo_category: string;
  /** 装修阶段 */
  renovation_stage?: string;
  /** 描述 */
  description?: string;
  /** 排序 */
  sort_order: number;
  /** 媒体类型 */
  media_type?: 'image' | 'video';
}

// ============================================================================
// 导入数据类型
// ============================================================================

export interface ImportPreviewData {
  /** L3项目ID */
  project_id: string;
  /** 小区ID */
  community_id?: string;
  /** 小区名称 */
  community_name: string;
  /** 户型 */
  layout?: string;
  /** 朝向 */
  orientation?: string;
  /** 楼层信息 */
  floor_info?: string;
  /** 面积(m²) */
  area?: number;
  /** 总价(万元) */
  total_price?: number;
  /** 单价(万元/m²) */
  unit_price?: number;
  /** 标题 */
  title: string;
  /** 标签 */
  tags?: string;
  /** 装修风格 */
  decoration_style?: string;
  /** 项目状态 */
  status?: string;
  /** 可导入的媒体资源 */
  available_media: ImportableMedia[];
}

// ============================================================================
// 组件Props类型
// ============================================================================

export interface ProjectSelectorProps {
  /** 是否打开 */
  open: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 选择回调 */
  onSelect: (project: L3ProjectBrief) => void;
  /** 已选项目ID */
  selectedId?: string;
}

export interface ProjectListItemProps {
  /** 项目数据 */
  project: L3ProjectBrief;
  /** 是否选中 */
  selected: boolean;
  /** 点击回调 */
  onClick: () => void;
}

export interface ImportPreviewProps {
  /** 导入数据 */
  data: ImportPreviewData;
  /** 确认回调 */
  onConfirm: () => void;
  /** 取消回调 */
  onCancel: () => void;
  /** 加载状态 */
  loading?: boolean;
}

// ============================================================================
// 查询参数类型
// ============================================================================

export interface ProjectQueryParams {
  /** 小区名称筛选 */
  community_name?: string;
  /** 项目状态筛选 */
  status?: string;
  /** 页码 */
  page: number;
  /** 每页大小 */
  page_size: number;
}
