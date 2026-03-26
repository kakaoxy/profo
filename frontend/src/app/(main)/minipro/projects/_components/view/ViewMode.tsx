"use client";

import * as React from "react";
import { InfoCard } from "../ui/InfoCard";
import { MarketingInfoView } from "./MarketingInfoView";
import { PhysicalInfoView } from "./PhysicalInfoView";
import { BasicConfigView } from "./BasicConfigView";
import { PhotoGallery } from "./PhotoGallery";
import type { ViewModeProps } from "../form-types";

export function ViewMode({ project, photos }: ViewModeProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* 左侧：主要信息 */}
      <div className="lg:col-span-7 space-y-6">
        <MarketingInfoView project={project} />
        <PhysicalInfoView project={project} />
      </div>

      {/* 右侧：配置和照片 */}
      <div className="lg:col-span-5 space-y-6">
        <BasicConfigView project={project} />
        <InfoCard title="照片">
          <PhotoGallery photos={photos} />
          <div className="mt-4 text-xs text-slate-400">
            如需管理照片（同步/删除/上传），请进入编辑页。
          </div>
        </InfoCard>
      </div>
    </div>
  );
}
