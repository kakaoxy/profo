import type { Project } from "../types";

export type ProjectStageKey = "signing" | "renovating" | "selling" | "sold" | "ended";

export interface ProjectStageMeta {
  key: ProjectStageKey;
  label: string;
  tone: string;
  bar: string;
}

export const PROJECT_STAGE_META: ProjectStageMeta[] = [
  { key: "signing", label: "签约", tone: "bg-sky-wash text-ink", bar: "bg-sky-wash" },
  { key: "renovating", label: "装修", tone: "bg-apricot-wash text-rust", bar: "bg-rust" },
  { key: "selling", label: "在售", tone: "bg-ink text-white", bar: "bg-ink" },
  { key: "sold", label: "已售", tone: "bg-fog text-ash", bar: "bg-dove" },
  { key: "ended", label: "已下架", tone: "bg-dove/20 text-graphite", bar: "bg-dove" },
];

const STAGE_BY_STATUS: Record<string, ProjectStageKey> = {
  signing: "signing",
  renovating: "renovating",
  selling: "selling",
  sold: "sold",
  ended: "ended",
};

export function getProjectStage(status: string): ProjectStageKey {
  return STAGE_BY_STATUS[status] ?? "signing";
}

export function getStageMeta(status: string): ProjectStageMeta {
  const stage = getProjectStage(status);
  return PROJECT_STAGE_META.find((item) => item.key === stage) ?? PROJECT_STAGE_META[0];
}

export function toWan(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return `${value.toLocaleString("zh-CN", { maximumFractionDigits: 1 })} 万`;
}

export function toWanValue(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return value.toLocaleString("zh-CN", { maximumFractionDigits: 1 });
}

export function toAmountWan(value?: number | null): number {
  return value ?? 0;
}

/** 财务金额以元存储、以万元展示。 */
export function yuanToWan(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return (value / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 1 });
}

export function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function daysSince(value?: string | null): number | null {
  const date = parseDate(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today.getTime() - date.getTime()) / 86_400_000));
}

export function daysBetween(from?: string | null, to?: string | null): number | null {
  const start = parseDate(from);
  const end = parseDate(to);
  if (!start || !end) return null;
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86_400_000));
}

export function formatShortDate(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return "—";
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function formatFullDate(value?: string | null): string {
  const date = parseDate(value);
  if (!date) return "—";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function projectTitle(project: Project): string {
  if (project.community_name) {
    let suffix = project.name.replace(`${project.community_name} - `, "").trim();
    if (project.district) suffix = suffix.replace(project.district, "").trim();
    // 小区字典缺失时 API 名称仍可能带「静安区」等区前缀，先去掉首个「区」前缀
    suffix = suffix.replace(/^[^区]*区/, "").trim();
    suffix = suffix.replace(project.community_name, "").trim();
    return suffix ? `${project.community_name} ${suffix}` : project.community_name;
  }
  return project.name || "未命名项目";
}

export function projectLocation(project: Project): string {
  if (project.district) return project.district;
  if (project.business_circle) return project.business_circle;
  return project.community_name ?? "—";
}

export function projectMeta(project: Project): string {
  return [projectLocation(project), project.layout || "户型未填", project.area ? `${project.area}㎡` : "面积未填", project.floor_info || "楼层未填"]
    .filter(Boolean)
    .join(" · ");
}

export function stageNote(project: Project): string {
  const stage = getProjectStage(project.status);
  if (stage === "signing") {
    const days = daysSince(project.signing_date);
    return days === null ? "已签约" : `已签 ${days} 天`;
  }
  if (stage === "renovating") {
    const days = daysSince(project.signing_date);
    return days === null ? "装修进行中" : `工期第 ${days} 天`;
  }
  if (stage === "selling") {
    const days = daysSince(project.listing_date);
    return days === null ? "已上架" : `上架 ${days} 天`;
  }
  if (stage === "sold") {
    const days = daysBetween(project.signing_date, project.sold_date);
    return days === null ? "已成交" : `成交周期 ${days} 天`;
  }
  return "已结束";
}

export function priceChange(project: Project): string | null {
  const sold = project.sold_price ?? 0;
  const list = project.list_price ?? 0;
  const signing = project.signing_price ?? 0;
  const compare = sold || list;
  if (!compare || !signing) return null;
  const diff = compare - signing;
  if (diff === 0) return "平签约价";
  return `${diff > 0 ? "+" : "−"}${Math.abs(diff).toFixed(1)} 万`;
}

export function managerName(project: Project): string {
  return project.project_manager?.nickname || project.project_manager?.username || "未分配";
}

export function managerInitial(project: Project): string {
  return managerName(project).slice(0, 1);
}

export function roiLabel(project: Project): string {
  if (project.roi === undefined || project.roi === null || Number.isNaN(project.roi)) return "—";
  return `${Math.round(project.roi)}%`;
}
