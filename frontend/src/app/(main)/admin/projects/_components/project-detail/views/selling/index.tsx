"use client";

import { Project } from "../../../../types";
import { ActualEndDateDialog } from "./actual-end-date-dialog";
import { RenovationArchive } from "./renovation-archive";
import { SalesProgress } from "./sales-progress";
import { SellingPricingCard } from "./pricing-card";

interface SellingViewProps {
  project: Project;
  onRefresh?: () => void;
  /** 页面级 flowbar「结束项目」受控弹窗 */
  endProjectDialogOpen?: boolean;
  onEndProjectDialogOpenChange?: (open: boolean) => void;
  /** 顶部「编辑项目」沿用页面级编辑入口 */
  onEdit?: () => void;
}

export function SellingView({
  project,
  onRefresh,
  endProjectDialogOpen,
  onEndProjectDialogOpenChange,
  onEdit,
}: SellingViewProps) {
  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <SellingPricingCard project={project} onEdit={onEdit} />
      <SalesProgress project={project} onRefresh={onRefresh} />
      <RenovationArchive project={project} />

      {endProjectDialogOpen !== undefined && onEndProjectDialogOpenChange && (
        <ActualEndDateDialog
          open={endProjectDialogOpen}
          onOpenChange={onEndProjectDialogOpenChange}
          projectId={project.id}
          onSuccess={() => onRefresh?.()}
          mode="end"
        />
      )}
    </div>
  );
}
