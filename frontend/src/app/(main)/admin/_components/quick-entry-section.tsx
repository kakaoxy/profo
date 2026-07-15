"use client";

import { Camera, TrendingUp } from "lucide-react";
import type { components } from "@/lib/api-types";
import { QuickEntryCard, RenovationRow, SellingRow } from "./quick-entry-card";

type ProjectResponse = components["schemas"]["ProjectResponse"];

interface QuickEntrySectionProps {
  renovationProjects: ProjectResponse[];
  sellingProjects: ProjectResponse[];
}

export function QuickEntrySection({
  renovationProjects,
  sellingProjects,
}: QuickEntrySectionProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <QuickEntryCard
        title="装修进度上传"
        icon={Camera}
        projects={renovationProjects}
        emptyText="暂无装修中项目"
        viewAllHref="/admin/projects?status=renovating"
        accentClass="text-status-renovating"
        routeSuffix="/renovation"
        renderRow={RenovationRow}
      />
      <QuickEntryCard
        title="销售记录录入"
        icon={TrendingUp}
        projects={sellingProjects}
        emptyText="暂无在售项目"
        viewAllHref="/admin/projects?status=selling"
        accentClass="text-status-selling"
        routeSuffix="/selling"
        renderRow={SellingRow}
      />
    </div>
  );
}
