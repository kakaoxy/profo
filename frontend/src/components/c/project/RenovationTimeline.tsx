"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronRight, ChevronUp, ImageIcon } from "lucide-react";
import { getFileUrl } from "@/lib/config";
import { isValidUrl } from "@/lib/validators";

const isDev = process.env.NODE_ENV === "development";

interface RenovationStage {
  stage: string;
  photo_count: number;
}

interface MediaItem {
  id: number;
  file_url: string;
  thumbnail_url?: string | null;
  media_type: string;
  photo_category: string;
  renovation_stage?: string | null;
  description?: string | null;
  sort_order: number;
}

interface RenovationTimelineProps {
  stages: RenovationStage[];
  media: MediaItem[];
}

export function RenovationTimeline({ stages, media }: RenovationTimelineProps) {
  const [expanded, setExpanded] = useState(false);

  if (!stages || stages.length === 0) return null;

  const mediaByStage = new Map<string, MediaItem[]>();
  for (const item of media ?? []) {
    if (!item.renovation_stage) continue;
    const list = mediaByStage.get(item.renovation_stage) ?? [];
    list.push(item);
    mediaByStage.set(item.renovation_stage, list);
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-ink">改造过程</h2>
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="flex items-center gap-1 text-sm text-graphite hover:text-ink transition-colors"
        >
          {expanded ? "收起时间轴" : "查看完整时间轴"}
          {expanded ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>
      </div>

      {!expanded && (
        <div
          className="flex gap-3 overflow-x-auto pb-2 transition-all duration-300"
          style={{ scrollbarWidth: "none" }}
        >
          <style>{`div[style*="scrollbar-width: none"]::-webkit-scrollbar { display: none; }`}</style>
          {stages.map((stage) => {
            const stageMedia = mediaByStage.get(stage.stage) ?? [];
            const firstImage = stageMedia.length > 0 ? stageMedia[0] : null;
            const imageUrl = firstImage
              ? getFileUrl(firstImage.thumbnail_url ?? firstImage.file_url)
              : "";

            return (
              <div key={stage.stage} className="shrink-0 w-40">
                <div className="relative aspect-square rounded-images overflow-hidden bg-fog mb-2">
                  {imageUrl && isValidUrl(imageUrl) ? (
                    isDev ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imageUrl}
                        alt={stage.stage}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Image
                        src={imageUrl}
                        alt={stage.stage}
                        fill
                        className="object-cover"
                        sizes="160px"
                      />
                    )
                  ) : (
                    <div className="flex items-center justify-center h-full text-graphite text-xs">
                      暂无图片
                    </div>
                  )}
                </div>
                <p className="text-sm font-medium text-ink truncate">
                  {stage.stage}
                </p>
                <p className="text-xs text-graphite">
                  {stage.photo_count}张照片
                </p>
              </div>
            );
          })}
        </div>
      )}

      {expanded && (
        <div className="transition-all duration-300">
          {stages.map((stage, index) => {
            const stageMedia = mediaByStage.get(stage.stage) ?? [];

            return (
              <div key={stage.stage}>
                {index > 0 && (
                  <div className="border-t border-dove/30 my-4" />
                )}
                <div className="mb-3">
                  <h3 className="text-sm font-medium text-ink">
                    {stage.stage}
                  </h3>
                  <p className="text-xs text-graphite">
                    {stage.photo_count}张照片
                  </p>
                </div>
                {stageMedia.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {stageMedia.map((item) => {
                      const imageUrl = getFileUrl(
                        item.thumbnail_url ?? item.file_url
                      );
                      return (
                        <div
                          key={item.id}
                          className="relative aspect-square rounded-images overflow-hidden bg-fog"
                        >
                        {isValidUrl(imageUrl) ? (
                          isDev ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={imageUrl}
                              alt={item.description ?? stage.stage}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Image
                              src={imageUrl}
                              alt={item.description ?? stage.stage}
                              fill
                              className="object-cover"
                              sizes="(max-width: 768px) 50vw, 33vw"
                            />
                          )
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <ImageIcon className="h-5 w-5 text-c-text-secondary" />
                          </div>
                        )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-xs text-graphite py-4 text-center">
                    暂无图片
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
