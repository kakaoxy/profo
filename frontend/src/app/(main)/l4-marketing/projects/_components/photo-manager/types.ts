import { RENOVATION_STAGES } from "../../types";

export interface RenovationPhoto {
  id: number | string;
  project_id: number | string;
  stage: string;
  url: string;
  filename?: string | null;
  description?: string | null;
  created_at: string;
}

export const STAGE_OPTIONS = [
  { value: "all", label: "全部" },
  ...RENOVATION_STAGES,
] as const;

export type StageOption = (typeof STAGE_OPTIONS)[number]["value"];
