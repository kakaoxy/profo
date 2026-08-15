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

export function QuickEntrySection({ renovationProjects, sellingProjects }: QuickEntrySectionProps) {
  const { hasPermission } = usePermission();
  // "查看全部"按钮链接到 /admin/projects?status=...，需 project:read 权限。
  // 普通用户无此权限时不显示按钮，避免点击后被权限守卫重定向。
  const showViewAll = hasPermission(PERMISSION_CODES.PROJECT_READ);

  // 卡片显示条件与后端 require_project_business_permission 业务身份双通道一致：
  //   1. 持子权限码（operator 默认拥有）
  //   2. 持 project:write（admin 默认拥有；自定义角色可手动分配）
  //   3. 被指派为业务负责人（user 角色被指派为对接人/销售团队成员，
  //      my-responsible 端点会返回其负责的项目，projects.length > 0 即业务身份匹配）
  // 任一条件满足即显示卡片；都不是则隐藏，避免普通用户看到空入口。
  const canViewRenovation =
    hasPermission(PERMISSION_CODES.PROJECT_RENOVATION_UPLOAD_PHOTO) ||
    hasPermission(PERMISSION_CODES.PROJECT_WRITE) ||
    renovationProjects.length > 0;
  const canViewSales =
    hasPermission(PERMISSION_CODES.PROJECT_SALES_ADD_RECORD) ||
    hasPermission(PERMISSION_CODES.PROJECT_WRITE) ||
    sellingProjects.length > 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
      {canViewRenovation && (
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
      )}
      {canViewSales && (
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
      )}
    </div>
  );
}
