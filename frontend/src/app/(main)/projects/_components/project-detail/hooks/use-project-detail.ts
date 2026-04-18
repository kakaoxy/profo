"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Project } from "../../../types";
import type { ViewMode } from "../constants";
import { STAGE_CONFIG } from "../constants";
import { getProjectDetailAction } from "../../../actions/core";

interface UseProjectDetailOptions {
  initialProject: Project | null;
  isOpen: boolean;
}

export function useProjectDetail({
  initialProject,
  isOpen,
}: UseProjectDetailOptions) {
  const router = useRouter();
  const isFetchingRef = useRef(false);
  const initialLoadRef = useRef(false);

  const [project, setProject] = useState(initialProject);
  const [viewMode, setViewMode] = useState<ViewMode>("signing");

  useEffect(() => {
    if (initialProject) {
      setProject(initialProject);
    }
  }, [initialProject]);

  const refreshProjectData = useCallback(
    async (isFull: boolean = false) => {
      if (!project?.id) return;
      if (isFetchingRef.current) return;

      isFetchingRef.current = true;
      try {
        const currentId = project.id;
        const res = await getProjectDetailAction(project.id, isFull);

        if (res.success && res.data) {
          setProject((prev) => {
            if (!prev || prev.id !== currentId) return prev;
            return { ...prev, ...res.data } as Project;
          });
        }
      } finally {
        isFetchingRef.current = false;
      }
    },
    [project?.id],
  );

  const handleViewModeChange = useCallback(
    (mode: ViewMode) => {
      setViewMode(mode);
      if (
        (mode === "signing" && !project?.signing_materials) ||
        mode === "sold"
      ) {
        refreshProjectData(true);
      }
    },
    [project?.signing_materials, refreshProjectData],
  );

  const handleHandoverSuccess = useCallback(async () => {
    router.refresh();
    await refreshProjectData();
    setViewMode("renovation");
  }, [router, refreshProjectData]);

  useEffect(() => {
    if (isOpen && project?.id && !initialLoadRef.current) {
      initialLoadRef.current = true;

      const index = STAGE_CONFIG.findIndex((s) =>
        (s.aliases as readonly string[]).includes(project.status),
      );
      const safeIndex = index === -1 ? 0 : index;
      const targetMode = STAGE_CONFIG[safeIndex].key;

      if (viewMode !== targetMode) {
        setViewMode(targetMode);
      }

      refreshProjectData(targetMode === "sold");
    }

    if (!isOpen) {
      initialLoadRef.current = false;
    }
  }, [isOpen, project?.id, project?.status, viewMode, refreshProjectData]);

  const currentStatusIndex = STAGE_CONFIG.findIndex((s) =>
    (s.aliases as readonly string[]).includes(project?.status || ""),
  );
  const currentProjectStageIndex =
    currentStatusIndex === -1 ? 0 : currentStatusIndex;

  return {
    project,
    viewMode,
    setViewMode,
    currentProjectStageIndex,
    refreshProjectData,
    handleViewModeChange,
    handleHandoverSuccess,
  };
}
