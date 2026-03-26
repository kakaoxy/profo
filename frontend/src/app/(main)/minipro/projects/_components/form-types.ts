"use client";

import type { L4MarketingProject, L4MarketingMedia } from "../types";
import type { L4MarketingProjectCreate, L4MarketingProjectUpdate } from "../types";

export type MiniProjectFormMode = "create" | "edit" | "view";

export interface MiniProjectFormActions {
  createL4MarketingProject: (
    body: L4MarketingProjectCreate,
  ) => Promise<{ success: boolean; data?: L4MarketingProject; error?: string }>;
  updateL4MarketingProject: (
    id: number,
    body: L4MarketingProjectUpdate,
  ) => Promise<{ success: boolean; data?: L4MarketingProject; error?: string }>;
}

export interface MiniProjectFormProps {
  mode: MiniProjectFormMode;
  initialProject?: L4MarketingProject;
  initialPhotos?: L4MarketingMedia[];
  actions?: MiniProjectFormActions;
}

export interface ViewModeProps {
  project?: L4MarketingProject;
  photos: L4MarketingMedia[];
}

export interface EditModeProps {
  mode: "create" | "edit";
  project?: L4MarketingProject;
  photos: L4MarketingMedia[];
  actions: MiniProjectFormActions;
}

export interface MarketingInfoViewProps {
  project?: L4MarketingProject;
}

export interface PhysicalInfoViewProps {
  project?: L4MarketingProject;
}

export interface BasicConfigViewProps {
  project?: L4MarketingProject;
}

export interface PhotoGalleryProps {
  photos: L4MarketingMedia[];
}

export interface MarketingInfoFieldsProps {
  // Form field props will be passed via react-hook-form context
}

export interface BasicConfigFieldsProps {
  // Form field props will be passed via react-hook-form context
}

export interface TagInputFieldProps {
  value: string[];
  onChange: (value: string[]) => void;
}
