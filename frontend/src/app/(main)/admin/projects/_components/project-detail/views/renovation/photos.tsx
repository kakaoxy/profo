"use client";

import Image from "next/image";
import { ImageIcon } from "lucide-react";

import { Project } from "../../../../types";
import { RENOVATION_STAGES } from "../../constants";
import { getThumbnailUrl } from "../../utils";
import { isValidUrl } from "@/lib/validators";

/**
 * 装修现场相册（只读摘要）—— 设计稿「现场相册」卡。
 * 数据来自 project.renovation_photos，按施工阶段分组取前 4 张；上传入口保留在时间线内。
 */
export function RenovationPhotos({ project }: { project: Project }) {
  const photos = project.renovation_photos ?? [];
  const recent = [...photos].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 4);

  return (
    <section className="rounded-cards bg-pure-white p-6 shadow-steep">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-[480] text-ink">现场相册</h3>
          <p className="mt-1 text-[13px] font-[430] text-graphite">
            {photos.length > 0 ? `${photos.length} 张 · 按施工阶段归档` : "按施工阶段归档现场照片"}
          </p>
        </div>
      </div>

      {recent.length > 0 ? (
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {recent.map((photo) => {
            const url = getThumbnailUrl(photo.thumbnail_url, photo.url);
            const stage = RENOVATION_STAGES.find((item) => item.value === photo.stage || item.key === photo.stage);
            return (
              <figure key={photo.id}>
                <div className="relative h-[150px] overflow-hidden rounded-[16px] bg-fog">
                  {isValidUrl(url) ? (
                    <Image
                      src={url}
                      alt={photo.description || stage?.label || "装修现场照片"}
                      fill
                      sizes="(max-width: 768px) 50vw, 25vw"
                      loading="lazy"
                      unoptimized
                      className="object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-dove">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <figcaption className="mt-2 text-center">
                  <span className="block text-[12px] font-[450] text-ink">{stage?.label ?? "现场"}</span>
                  <span className="mt-0.5 block text-[11px] text-dove">{photo.created_at.slice(0, 10)}</span>
                </figcaption>
              </figure>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-[16px] border border-dashed border-dove/30 bg-fog/50 p-5 text-center md:grid-cols-4">
          {["拆除", "水电", "泥瓦", "交付"].map((label) => (
            <div key={label} className="grid h-[110px] place-items-center rounded-[12px] bg-pure-white/60 text-[11px] text-dove">
              <span className="flex flex-col items-center gap-2"><ImageIcon className="h-4 w-4" />{label}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
