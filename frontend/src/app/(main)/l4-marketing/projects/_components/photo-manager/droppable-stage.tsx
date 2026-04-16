"use client";

import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";

interface DroppableStageProps {
  id: string;
  children: React.ReactNode;
  isEmpty?: boolean;
  isActive?: boolean;
}

export function DroppableStage({ id, children, isEmpty, isActive }: DroppableStageProps) {
  const { isOver, setNodeRef } = useDroppable({
    id,
    data: {
      type: "stage",
      stage: id.replace("renovation-", ""),
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "space-y-2 rounded border-2 border-dashed transition-all",
        // 基础样式
        "min-h-[80px] p-3",
        // 空状态样式
        isEmpty && "flex items-center justify-center",
        // 默认状态
        !isOver && "border-[#22c55e]/30 bg-[#f0fdf4]/30",
        // Hover 状态
        isOver && "border-[#22c55e] bg-[#f0fdf4] ring-2 ring-[#22c55e]/20",
        // 拖拽激活时的样式
        isActive && "border-[#22c55e]/50 bg-[#f0fdf4]/50"
      )}
    >
      {children}
    </div>
  );
}
