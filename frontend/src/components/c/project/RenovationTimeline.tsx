"use client";

import { useState, useCallback } from "react";
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

  const toggle = useCallback(() => setExpanded((prev) => !prev), []);

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
        <h2 className="text-[22px] font-medium text-ink leading-subheading tracking-subheading font-display">
          改造过程
        </h2>
        <button
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls="renovation-timeline-content"
          className="flex items-center gap-1 text-sm text-graphite hover:text-ink focus-visible:ring-2 focus-visible:ring-ink/20 rounded-md transition-colors"
        >
          {expanded ? "收起时间轴" : "查看完整时间轴"}
          {expanded ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {!expanded && (
        <div
          className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          id="renovation-timeline-content"
        >
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
                        width={160}
                        height={160}
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
                <p className="text-xs text-graphite tabular-nums">
                  {stage.photo_count}张照片
                </p>
              </div>
            );
          })}
        </div>
      )}

      {expanded && (
        <div id="renovation-timeline-content">
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
                  <p className="text-xs text-graphite tabular-nums">
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
                              width={200}
                              height={200}
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
                            <ImageIcon className="h-5 w-5 text-graphite" aria-hidden="true" />
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
