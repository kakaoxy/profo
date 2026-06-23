// src/app/(main)/projects/types/renovation.ts
// 装修相关类型定义

export interface RenovationPhoto {
  id: string;
  project_id: string;
  renovation_id?: string;
  stage: string;
  url: string;
  filename?: string;
  description?: string;
  created_at: string;
}

export interface RenovationNodeData {
  status: "pending" | "active" | "completed";
  date?: string | null;
  photos?: RenovationPhoto[];
}
