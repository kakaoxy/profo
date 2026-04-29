/**
 * 项目状态映射配置
 */

export const statusMap: Record<string, { label: string; color: string }> = {
  signing: { label: "已签约", color: "bg-blue-100 text-blue-700" },
  renovating: { label: "装修中", color: "bg-yellow-100 text-yellow-700" },
  selling: { label: "在售中", color: "bg-green-100 text-green-700" },
  sold: { label: "已成交", color: "bg-purple-100 text-purple-700" },
};
