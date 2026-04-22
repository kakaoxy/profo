/**
 * 营销信息编辑组件库
 *
 * 此目录包含 MarketingInfoFields 的所有子组件
 * 每个组件都遵循单一职责原则，专注于特定功能
 */

// 类型定义
export * from "./types";

// 小区选择组件（从通用组件库导出）
export { CommunitySelect } from "@/components/common/community-select";

// 户型输入组件
export { LayoutInputs } from "./LayoutInputs";

// 楼层输入组件
export { FloorInput } from "./FloorInput";

// 朝向选择组件
export { OrientationSelect } from "./OrientationSelect";

// 顾问选择组件
export { ConsultantSelect } from "./ConsultantSelect";

// 价格相关组件
export { TotalPriceInput, UnitPriceDisplay } from "./PriceInputs";

// 面积输入组件
export { AreaInput } from "./AreaInput";
