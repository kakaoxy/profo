/** 经纪人模块共用文案映射（列表 / 抽屉 / 弹层一致）. */

export const BROKER_STATUS_LABELS: Record<string, string> = {
  bound: "已绑定",
  unbound: "未绑定",
  unbound_after: "已解绑",
  pending: "待审核",
  disabled: "已停用",
};

export const BROKER_SOURCE_LABELS: Record<string, string> = {
  self_apply: "自主申请",
  employee: "员工推荐",
  backoffice: "后台新增",
  broker: "经纪人推荐",
  import: "批量导入",
  store_contact: "门店联系人",
  store_employee: "门店员工",
};

export const BINDING_RECORD_LABELS: Record<string, string> = {
  pending: "待审核",
  active: "已绑定",
  approved: "已通过",
  rejected: "已拒绝",
  unbound: "已解绑",
};

export const BROKER_SOURCE_OPTIONS = [
  { value: "self_apply", label: "自主申请" },
  { value: "employee", label: "员工推荐" },
  { value: "backoffice", label: "后台新增" },
  { value: "broker", label: "经纪人推荐" },
  { value: "store_contact", label: "门店联系人" },
  { value: "store_employee", label: "门店员工" },
  { value: "import", label: "批量导入" },
] as const;

/** 状态徽标语义色（DESIGN 只允许 neutral / Apricot / Rust 三种）. */
export function brokerStatusTone(status: string): "neutral" | "attention" | "positive" {
  if (status === "bound") return "positive";
  if (status === "pending") return "attention";
  return "neutral";
}
