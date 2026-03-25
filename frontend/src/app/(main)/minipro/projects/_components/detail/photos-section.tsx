"use client";

import Link from "next/link";
import { InfoCard } from "../ui/InfoCard";
import { PhotoGallery } from "../view/PhotoGallery";
import type { PhotosSectionProps } from "./types";

export function PhotosSection({ project, photos }: PhotosSectionProps) {
  return (
    <InfoCard title="照片">
      <PhotoGallery photos={photos} />
      <div className="mt-4 text-xs text-slate-400">
        如需管理照片（同步/删除/上传），请进入
        <Link
          href={`/minipro/projects/${project.id}/edit`}
          className="text-blue-600 hover:text-blue-700 underline mx-1"
        >
          编辑页
        </Link>
        。
      </div>
    </InfoCard>
  );
}
