"use client";

import { Badge } from "@/components/ui/badge";
import { InfoCard } from "../ui/InfoCard";
import { DisplayRow } from "../ui/DisplayRow";
import type { MarketingInfoSectionProps } from "./types";

export function MarketingInfoSection({ project, onPreviewImage }: MarketingInfoSectionProps) {
  return (
    <InfoCard title="营销信息">
      <div className="space-y-4">
        <DisplayRow
          label="营销标题"
          value={
            <span className="text-lg font-semibold text-slate-900">
              {project.title || "-"}
            </span>
          }
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <DisplayRow label="物业风格" value={project.style || "-"} />
          <DisplayRow label="排序权重" value={project.sort_order ?? 0} />
        </div>
        <DisplayRow
          label="营销标签"
          value={
            typeof project.marketing_tags === "string" && project.marketing_tags ? (
              <div className="flex flex-wrap gap-2">
                {project.marketing_tags.split(",").map((tag) => (
                  <Badge
                    key={tag}
                    variant="secondary"
                    className="bg-slate-100 text-slate-700"
                  >
                    {tag.trim()}
                  </Badge>
                ))}
              </div>
            ) : (
              "-"
            )
          }
        />
        <DisplayRow
          label="项目描述"
          value={
            project.description ? (
              <div className="whitespace-pre-wrap text-slate-600 leading-relaxed">
                {project.description}
              </div>
            ) : (
              "-"
            )
          }
        />

        <div className="pt-4 border-t border-slate-100">
          <h3 className="text-sm font-semibold text-slate-800 mb-4">分享配置</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DisplayRow label="分享标题" value={project.share_title || "-"} />
            <DisplayRow
              label="分享图"
              value={
                project.share_image ? (
                  <button
                    onClick={() => onPreviewImage(project.share_image!)}
                    className="text-blue-600 hover:text-blue-700 underline underline-offset-2"
                  >
                    查看图片
                  </button>
                ) : (
                  "-"
                )
              }
            />
          </div>
        </div>
      </div>
    </InfoCard>
  );
}
