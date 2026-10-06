"use client";

import { Button } from "@/components/ui/button";
import { Pencil, Eye, DollarSign } from "lucide-react";
import Link from "next/link";
import { L4MarketingProject } from "@/app/(main)/admin/marketing/types";
import { deleteL4MarketingProjectAction } from "../actions";
import { DeleteConfirmButton } from "@/components/common";
import { memo, useCallback } from "react";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import { PricePopover } from "./price-popover";
import { showPricingEntry } from "./price-change-card";

interface ActionCellProps {
  project: L4MarketingProject;
}

export const ActionCell = memo(function ActionCell({ project }: ActionCellProps) {
  const { hasPermission } = usePermission();
  const canWrite = hasPermission(PERMISSION_CODES.L4_MARKETING_WRITE);
  // 详情卡与列表弹层共用同一判定（spec D-1，禁止在此复制判定逻辑）
  const showPriceEntry = showPricingEntry(project, canWrite);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <div className="flex items-center gap-1">
      <Link href={`/projects/${project.id}`} target="_blank" onClick={handleClick}>
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

      <Link href={`/admin/marketing/${project.id}`} onClick={handleClick}>
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

      {/* 行内快捷调价（已发布 + 有写权限 + 非已售；弹层内嵌 PriceChangeCard 表单态） */}
      {showPriceEntry && (
        <PricePopover
          project={project}
          trigger={
            <Button
              variant="ghost"
              size="sm"
              className="text-rust hover:bg-apricot-wash hover:text-rust h-8 w-8 sm:w-auto sm:px-2 p-0 flex items-center justify-center gap-1 transition-all rounded-full"
              onClick={handleClick}
              data-testid={`price-entry-${project.id}`}
            >
              <DollarSign className="h-3.5 w-3.5" />
              <span className="hidden lg:inline text-xs font-medium">调价</span>
            </Button>
          }
        />
      )}

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
  );
});
