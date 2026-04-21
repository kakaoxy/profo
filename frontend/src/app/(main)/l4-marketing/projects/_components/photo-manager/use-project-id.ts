"use client";

interface UseProjectIdOptions {
  l4ProjectId?: number;
  l3ProjectId?: string | null;
}

interface UseProjectIdReturn {
  effectiveProjectId: number | undefined;
  isCreateMode: boolean;
}

export function useProjectId({
  l4ProjectId,
  l3ProjectId,
}: UseProjectIdOptions): UseProjectIdReturn {
  const parsedL3Id = l3ProjectId ? parseInt(l3ProjectId) : NaN;
  const effectiveProjectId = l4ProjectId ?? (parsedL3Id > 0 ? parsedL3Id : undefined);
  const isCreateMode = !effectiveProjectId;

  return {
    effectiveProjectId,
    isCreateMode,
  };
}
