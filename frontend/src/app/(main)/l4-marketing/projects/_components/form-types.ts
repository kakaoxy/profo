"use client";

import type { L4MarketingProject, L4MarketingMedia } from "@/app/(main)/l4-marketing/projects/types";
import type { L4MarketingProjectCreate, L4MarketingProjectUpdate } from "@/app/(main)/l4-marketing/projects/types";
import type { ActionResult } from "@/app/(main)/l4-marketing/projects/actions/projects";

export type MiniProjectFormMode = "create" | "edit" | "view";

export interface MiniProjectFormActions {
  createL4MarketingProject: (
    body: L4MarketingProjectCreate,
  ) => Promise<ActionResult<L4MarketingProject>>;
  updateL4MarketingProject: (
    id: number,
    body: L4MarketingProjectUpdate,
  ) => Promise<ActionResult<L4MarketingProject>>;
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
