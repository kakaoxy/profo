"use client";

import { useState, useCallback } from "react";

type ViewMode = "table" | "grid";

export function useViewMode(defaultMode: ViewMode = "table") {
  const [viewMode, setViewMode] = useState<ViewMode>(defaultMode);

  const setTableView = useCallback(() => setViewMode("table"), []);
  const setGridView = useCallback(() => setViewMode("grid"), []);

  return {
    viewMode,
    setViewMode,
    setTableView,
    setGridView,
    isTableView: viewMode === "table",
    isGridView: viewMode === "grid",
  };
}
