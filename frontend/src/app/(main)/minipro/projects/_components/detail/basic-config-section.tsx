"use client";

import { Badge } from "@/components/ui/badge";
import { InfoCard } from "../ui/InfoCard";
import { DisplayRow } from "../ui/DisplayRow";
import { getFileUrl } from "@/lib/config";
import { getConsultantName, getStatusConfig } from "./utils";
import type { BasicConfigSectionProps } from "./types";

export function BasicConfigSection({
  project,
  consultants,
  onPreviewImage,
}: BasicConfigSectionProps) {
  const consultantName = getConsultantName(project, consultants);
  const statusConfigItem = getStatusConfig(project.project_status || "在途");

  return (
    <InfoCard title="基础配置">
      <div className="space-y-4">
        <DisplayRow
          label="封面图"
          value={
            project.cover_image ? (
              <div className="flex items-center gap-3">
                <img
                  src={getFileUrl(project.cover_image)}
                  alt="封面"
                  className="w-16 h-16 rounded-lg object-cover border border-slate-200"
                />
                <button
                  onClick={() => onPreviewImage(getFileUrl(project.cover_image!))}
                  className="text-blue-600 hover:text-blue-700 underline underline-offset-2 text-sm"
                >
                  查看原图
                </button>
              </div>
            ) : (
              <span className="text-slate-400">未设置封面</span>
            )
          }
        />
        <DisplayRow label="顾问" value={consultantName} />
        <DisplayRow
          label="发布状态"
          value={
            <Badge
              variant="secondary"
              className={
                project.is_published
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-amber-100 text-amber-700"
              }
            >
              {project.is_published ? "已发布" : "草稿"}
            </Badge>
          }
        />
        <DisplayRow
          label="项目状态"
          value={
            <Badge variant="secondary" className={statusConfigItem.className}>
              {statusConfigItem.label}
            </Badge>
          }
        />
        <DisplayRow label="浏览量" value={project.view_count ?? 0} />
        <div className="pt-4 border-t border-slate-100">
          <div className="grid grid-cols-1 gap-2 text-xs text-slate-500">
            <div>发布时间: {project.published_at || "-"}</div>
            <div>创建时间: {project.created_at || "-"}</div>
            <div>更新时间: {project.updated_at || "-"}</div>
          </div>
        </div>
      </div>
    </InfoCard>
  );
}
