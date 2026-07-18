"use client";

import { Camera, TrendingUp } from "lucide-react";
import type { components } from "@/lib/api-types";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
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
  const { hasPermission } = usePermission();
  // "查看全部"按钮链接到 /admin/projects?status=...，需 project:read 权限。
  // 普通用户无此权限时不显示按钮，避免点击后被权限守卫重定向。
  const showViewAll = hasPermission(PERMISSION_CODES.PROJECT_READ);

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
        showViewAll={showViewAll}
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
        showViewAll={showViewAll}
      />
    </div>
  );
}
