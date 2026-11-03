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

/** 绑定来源（MerchantBindSource）：用于修正「自主申请」看不到扫码/分享来路的问题. */
export const BIND_SOURCE_LABELS: Record<string, string> = {
  qrcode: "扫码绑定",
  share: "分享绑定",
  manual: "手工绑定",
  backoffice: "后台绑定",
};

/**
 * 列表/抽屉展示用的来源文案.
 *
 * `source` 记录档案创建渠道（注册入口统一写 self_apply），`bind_source` 记录真实绑定渠道；
 * 扫码/分享进入的经纪人 source 只是 self_apply，如果只展示 source 会被误读为「自主申请」。
 * 因此 self_apply 优先展示绑定渠道，其余来源保持原义。
 */
export function brokerSourceLabel(source: string, bindSource?: string | null): string {
  if (source === "self_apply" && bindSource && BIND_SOURCE_LABELS[bindSource]) {
    return BIND_SOURCE_LABELS[bindSource];
  }
  return BROKER_SOURCE_LABELS[source] || source;
}

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
