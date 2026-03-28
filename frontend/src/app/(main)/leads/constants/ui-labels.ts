// 页面标题
export const PAGE_TITLE = "线索中心";
export const PAGE_SUBTITLE = "实时管理与评估房产线索流转状态";

// 按钮文本
export const BUTTON_TEXT = {
  RESET_FILTERS: "重置筛选",
  ADD_LEAD: "录入新线索",
  SAVE: "保存修改",
  CONFIRM_ADD: "确认录入线索",
  CANCEL: "取消",
  DELETE: "删除",
  EDIT: "编辑",
  VIEW_MONITOR: "数据大盘",
} as const;

// 表单标签
export const FORM_LABELS = {
  COMMUNITY_NAME: "房源名称",
  DISTRICT: "所在区域",
  BUSINESS_AREA: "核心商圈",
  AREA: "面积 (㎡)",
  ORIENTATION: "朝向",
  FLOOR: "楼层/总高",
  TOTAL_PRICE: "用户报价 (万)",
  UNIT_PRICE: "计算单价",
  LAYOUT: "房源户型",
  REMARKS: "补充信息",
  IMAGES: "房源实拍",
} as const;

// 筛选标签
export const FILTER_LABELS = {
  SEARCH: "房源名称",
  DISTRICT: "区域范围",
  CREATOR: "录入人",
  STATUS: "流程状态",
  LAYOUT: "房源户型",
  FLOOR: "楼层高低",
} as const;

// 操作成功消息
export const SUCCESS_MESSAGES = {
  AUDIT_COMPLETED: "审核完成",
  FOLLOW_UP_ADDED: "跟进记录已添加",
  LEAD_UPDATED: "线索更新成功",
  LEAD_CREATED: "线索创建成功",
  LEAD_DELETED: "线索已删除",
} as const;

// 操作失败消息
export const ERROR_MESSAGES = {
  AUDIT_FAILED: "审核失败",
  FOLLOW_UP_FAILED: "添加跟进记录失败",
  UPDATE_FAILED: "更新失败",
  CREATE_FAILED: "创建失败",
  DELETE_FAILED: "删除失败",
} as const;

// 确认对话框
export const CONFIRM_DIALOG = {
  DELETE_TITLE: "确定要删除这条线索吗？",
  DELETE_DESCRIPTION: "此操作无法撤销。",
} as const;

// 加载状态
export const LOADING_TEXT = {
  LOADING: "加载中...",
  SEARCHING: "搜索中...",
  UPLOADING: "上传中...",
} as const;

// 视图模式
export const VIEW_MODE_LABELS = {
  TABLE: "Table",
  GRID: "Grid",
} as const;

// 抽屉标签
export const DRAWER_TABS = {
  INFO: "决策面板",
  IMAGES: (count: number) => `影像库 (${count})`,
  FOLLOW_UP: "流转轨迹",
} as const;

// 市场动态标签
export const MARKET_LABELS = {
  TITLE: "实时市场动态",
  LISTING_COUNT: "挂牌量",
  DEAL_COUNT: "成交(12M)",
  INVENTORY_MONTHS: "去化压力",
  VIEW_FULL: "查看区域供需全景",
} as const;

// 户型选项
export const LAYOUT_OPTIONS = ["1", "2", "3", "4", "4+"] as const;

// 楼层选项
export const FLOOR_OPTIONS = ["低", "中", "高"] as const;

// 朝向选项
export const ORIENTATION_OPTIONS = ["南", "北", "东", "西", "南北", "东西"] as const;

// 跟进方式选项
export const FOLLOW_UP_METHODS = {
  phone: "电话沟通",
  wechat: "微信联络",
  face: "面谈记录",
  visit: "带看实勘",
} as const;
