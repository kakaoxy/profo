/**
 * 营销信息字段组件类型定义
 * 
 * 此文件包含所有子组件共享的类型定义
 */

import type { UserSimpleResponse } from "@/app/(main)/users/actions";

/**
 * 小区数据结构
 */
export interface Community {
  id: string;
  name: string;
  district?: string;
  businessCircle?: string;
}

/**
 * 小区选择组件Props
 */
export interface CommunitySelectProps {
  /** 当前选中的小区名称 */
  value: string;
  /** 选择回调，返回小区名称和ID */
  onChange: (value: string, id?: string) => void;
}

/**
 * 户型输入组件Props
 */
export interface LayoutInputsProps {
  /** 当前户型值，格式如："3室2厅1卫" */
  value: string;
  /** 变更回调 */
  onChange: (value: string) => void;
}

/**
 * 楼层输入组件Props
 */
export interface FloorInputProps {
  /** 当前楼层信息，格式如："5/共12层" */
  value: string;
  /** 变更回调 */
  onChange: (value: string) => void;
}

/**
 * 朝向选择组件Props
 */
export interface OrientationSelectProps {
  /** 当前选中的朝向 */
  value: string;
  /** 变更回调 */
  onChange: (value: string) => void;
}

/**
 * 顾问选择组件Props
 */
export interface ConsultantSelectProps {
  /** 当前选中的顾问ID */
  value: string | undefined;
  /** 变更回调 */
  onChange: (value: string | undefined) => void;
}

/**
 * 总价输入组件Props
 */
export interface TotalPriceInputProps {
  /** 当前总价（万元） */
  value: string;
  /** 变更回调 */
  onChange: (value: string) => void;
}

/**
 * 单价显示组件Props
 */
export interface UnitPriceDisplayProps {
  /** 当前单价（元/㎡） */
  value: string;
}

/**
 * 价格输入区域组件Props
 */
export interface PriceInputsSectionProps {
  /** 当前总价 */
  totalPrice: number | string;
  /** 当前单价 */
  unitPrice: number | string;
  /** 总价变更回调 */
  onTotalPriceChange: (value: number) => void;
}

/**
 * 面积输入组件Props
 */
export interface AreaInputProps {
  /** 当前面积值（数字） */
  value: number | undefined;
  /** 变更回调，返回数字 */
  onChange: (value: number) => void;
}

export { UserSimpleResponse };
