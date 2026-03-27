export interface RenovationPhoto {
  id: number;
  project_id: number;
  stage: string;
  url: string;
  filename?: string | null;
  description?: string | null;
  created_at: string;
}

export const STAGE_OPTIONS = [
  { value: "all", label: "全部" },
  { value: "拆除", label: "拆除阶段" },
  { value: "水电", label: "水电阶段" },
  { value: "木瓦", label: "木瓦阶段" },
  { value: "油漆", label: "油漆阶段" },
  { value: "安装", label: "安装阶段" },
  { value: "交付", label: "交付阶段" },
  { value: "other", label: "其他" },
] as const;

export type StageOption = (typeof STAGE_OPTIONS)[number]["value"];
