"use client";

import * as React from "react";
import { EditMode } from "./project-form/EditMode";
import { createL4MarketingProjectAction, updateL4MarketingProjectAction } from "../actions";
import type { MiniProjectFormProps, MiniProjectFormActions } from "./form-types";

// Default actions
const defaultActions: MiniProjectFormActions = {
  createL4MarketingProject: createL4MarketingProjectAction,
  updateL4MarketingProject: updateL4MarketingProjectAction,
};

export function MiniProjectForm({
  mode,
  initialProject,
  initialPhotos = [],
  actions,
  defaultConsultantId,
}: MiniProjectFormProps) {
  const resolvedActions = actions ?? defaultActions;

  return (
    <EditMode
      mode={mode === "view" ? "edit" : mode}
      project={initialProject}
      photos={initialPhotos}
      actions={resolvedActions}
      defaultConsultantId={defaultConsultantId}
    />
  );
}

// Re-export types for consumers
export type { MiniProjectFormMode, MiniProjectFormProps } from "./form-types";
