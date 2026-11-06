import type { StatusTone } from "@/app/(main)/admin/_components/status-badge";

export const STORE_STATUS_LABELS: Record<string, string> = {
  normal: "正常",
  disabled: "停用",
  merged: "已合并",
  relocated: "已搬迁",
};

export const REVIEW_LABELS: Record<string, string> = {
  pending: "待审核",
  approved: "已转正",
  merged: "已合并",
};

export const SOURCE_LABELS: Record<string, string> = {
  employee: "员工建档",
  backoffice: "后台新增",
  import: "批量导入",
  broker: "经纪人创建",
};

export function cooperationTone(status: string | null | undefined): StatusTone {
  if (status === "cooperated") return "positive";
  if (status === "negotiating") return "attention";
  return "neutral";
}

export function reviewTone(status: string | null | undefined): StatusTone {
  if (status === "approved") return "positive";
  if (status === "pending") return "attention";
  return "neutral";
}

export function storeTone(status: string | null | undefined): StatusTone {
  return status === "normal" ? "positive" : "neutral";
}

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatter.format(date);
}
