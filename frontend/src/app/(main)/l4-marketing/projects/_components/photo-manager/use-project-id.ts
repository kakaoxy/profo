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
  // L3项目ID是UUID格式，不应尝试解析为数字
  // effectiveProjectId 仅由 l4ProjectId 决定
  const effectiveProjectId = l4ProjectId;
  // 创建模式：没有L4项目ID，但有L3项目ID（表示从L3创建L4项目）
  const isCreateMode = !l4ProjectId && !!l3ProjectId;

  return {
    effectiveProjectId,
    isCreateMode,
  };
}
