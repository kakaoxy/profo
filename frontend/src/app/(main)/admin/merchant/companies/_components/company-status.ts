import type { StatusTone } from "@/app/(main)/admin/_components/status-badge";

export const COMPANY_STATUS_LABELS: Record<string, string> = {
  normal: "正常",
  disabled: "停用",
};

export function companyTone(status: string | null | undefined): StatusTone {
  return status === "normal" ? "neutral" : "attention";
}

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export function formatCompanyDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return dateTimeFormatter.format(date);
}
