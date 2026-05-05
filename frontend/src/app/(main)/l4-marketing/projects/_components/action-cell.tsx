"use client";

import { Button } from "@/components/ui/button";
import { Pencil, Eye } from "lucide-react";
import Link from "next/link";
import { L4MarketingProject } from "@/app/(main)/l4-marketing/projects/types";
import { deleteL4MarketingProjectAction } from "../actions";
import { DeleteConfirmButton } from "@/components/common";
import { memo, useCallback } from "react";

interface ActionCellProps {
  project: L4MarketingProject;
}

export const ActionCell = memo(function ActionCell({ project }: ActionCellProps) {
  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div className="flex items-center gap-1">
      <Link
        href={`/l4-marketing/projects/${project.id}/preview`}
        onClick={handleClick}
      >
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-primary hover:bg-primary/10 h-8 w-8 sm:w-auto sm:px-2 p-0 flex items-center justify-center gap-1 transition-all rounded-full"
          onClick={handleClick}
        >
          <Eye className="h-3.5 w-3.5" />
          <span className="hidden lg:inline text-xs font-medium">预览</span>
        </Button>
      </Link>

      <Link
        href={`/l4-marketing/projects/${project.id}/edit`}
        onClick={handleClick}
      >
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-primary hover:bg-primary/10 h-8 w-8 sm:w-auto sm:px-2 p-0 flex items-center justify-center gap-1 transition-all rounded-full"
          onClick={handleClick}
        >
          <Pencil className="h-3.5 w-3.5" />
          <span className="hidden lg:inline text-xs font-medium">编辑</span>
        </Button>
      </Link>

      <div className="hidden sm:block">
        <DeleteConfirmButton
          onDelete={async () => {
            const res = await deleteL4MarketingProjectAction(project.id);
            if (res.success) {
              return { success: true };
            }
            return { success: false, message: res.error };
          }}
          itemName={project.title}
          description="该操作不可撤销。"
        />
      </div>
    </div>
  );
});
