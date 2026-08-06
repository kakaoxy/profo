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
        "min-h-20 p-3",
        // 空状态样式
        isEmpty && "flex items-center justify-center",
        // 默认状态 - 使用 rust 统一高亮
        !isOver && "border-rust/30 bg-rust/10",
        // Hover 状态
        isOver && "border-rust bg-rust/20 ring-2 ring-rust/20",
        // 拖拽激活时的样式
        isActive && "border-rust/50 bg-rust/15"
      )}
    >
      {children}
    </div>
  );
}
