"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { ChevronRight, ChevronUp, ImageIcon, Play } from "lucide-react";
import { getFileUrl, getThumbnailUrl } from "@/lib/config";
import type { components } from "@/lib/api-types";
import { isValidUrl } from "@/lib/validators";
import { cLocale } from "@/lib/i18n/c-locale";

const isDev = process.env.NODE_ENV === "development";

type PublicRenovationStage = components["schemas"]["PublicRenovationStage"];
type PublicMediaItem = components["schemas"]["PublicMediaItem"];

interface RenovationTimelineProps {
  stages: PublicRenovationStage[];
  media: PublicMediaItem[];
}

export function RenovationTimeline({ stages, media }: RenovationTimelineProps) {
  const [expanded, setExpanded] = useState(false);

  const toggle = useCallback(() => setExpanded((prev) => !prev), []);

  if (!stages || stages.length === 0) return null;

  const mediaByStage = new Map<string, PublicMediaItem[]>();
  for (const item of media ?? []) {
    if (!item.renovation_stage) continue;
    const list = mediaByStage.get(item.renovation_stage) ?? [];
    list.push(item);
    mediaByStage.set(item.renovation_stage, list);
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[22px] font-medium text-ink leading-subheading tracking-subheading">
          {cLocale.projects.renovationProcess}
        </h2>
        <button
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls="renovation-timeline-content"
          className="flex items-center gap-1 text-sm text-graphite hover:text-ink focus-visible:ring-2 focus-visible:ring-ink/20 rounded-md transition-colors"
        >
          {expanded ? cLocale.projects.collapseTimeline : cLocale.projects.viewFullTimeline}
          {expanded ? (
            <ChevronUp className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>

      {!expanded && (
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none [&::-webkit-scrollbar]:hidden">
          {stages.map((stage) => {
            const stageMedia = mediaByStage.get(stage.stage) ?? [];
            const firstMedia = stageMedia.length > 0 ? stageMedia[0] : null;
            const isVideo = firstMedia?.media_type === "video";
            // 视频封面仅用缩略图，禁止回退到 mp4 原地址（<img> 无法加载）
            const posterUrl =
              isVideo && firstMedia?.thumbnail_url
                ? getThumbnailUrl(firstMedia.thumbnail_url, "")
                : "";
            const imageUrl =
              firstMedia && !isVideo
                ? getThumbnailUrl(firstMedia.thumbnail_url, firstMedia.file_url)
                : "";

            return (
              <div key={stage.stage} className="shrink-0 w-40">
                <div className="relative aspect-square rounded-images overflow-hidden bg-fog mb-2">
                  {isVideo ? (
                    posterUrl && isValidUrl(posterUrl) ? (
                      <>
                        {isDev ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={posterUrl}
                            alt={stage.stage}
                            width={160}
                            height={160}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <Image
                            src={posterUrl}
                            alt={stage.stage}
                            fill
                            className="object-cover"
                            sizes="160px"
                          />
                        )}
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-black/50">
                            <Play
                              className="h-4 w-4 text-white"
                              fill="currentColor"
                              aria-hidden="true"
                            />
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-graphite/10">
                        <Play
                          className="h-5 w-5 text-graphite"
                          fill="currentColor"
                          aria-hidden="true"
                        />
                      </div>
                    )
                  ) : imageUrl && isValidUrl(imageUrl) ? (
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
                      {cLocale.projects.noPhotos}
                    </div>
                  )}
                </div>
                <p className="text-sm font-medium text-ink truncate">{stage.stage}</p>
                <p className="text-xs text-graphite tabular-nums">
                  {cLocale.projects.photoCount(stage.photo_count)}
                </p>
                {stage.completed_date && (
                  <p className="text-xs text-graphite tabular-nums">
                    {cLocale.projects.completedOn(stage.completed_date)}
                  </p>
                )}
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
                {index > 0 && <div className="border-t border-dove/30 my-4" />}
                <div className="mb-3">
                  <h3 className="text-sm font-medium text-ink">{stage.stage}</h3>
                  <p className="text-xs text-graphite tabular-nums">
                    {cLocale.projects.photoCount(stage.photo_count)}
                  </p>
                  {stage.completed_date && (
                    <p className="text-xs text-graphite tabular-nums">
                      {cLocale.projects.completedOn(stage.completed_date)}
                    </p>
                  )}
                </div>
                {stageMedia.length > 0 ? (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {stageMedia.map((item) => {
                      const isVideo = item.media_type === "video";
                      const videoUrl = isVideo ? getFileUrl(item.file_url) : "";
                      // 视频封面仅用缩略图，禁止回退到 mp4 原地址（与上方 posterUrl 写法一致）
                      const videoPoster =
                        isVideo && item.thumbnail_url
                          ? getThumbnailUrl(item.thumbnail_url, "")
                          : "";
                      const imageUrl = isVideo
                        ? ""
                        : getThumbnailUrl(item.thumbnail_url, item.file_url);
                      return (
                        <div
                          key={item.id}
                          className="relative aspect-square rounded-images overflow-hidden bg-fog"
                        >
                          {isVideo ? (
                            videoUrl ? (
                              <video
                                src={videoUrl}
                                poster={videoPoster || undefined}
                                controls
                                playsInline
                                preload="metadata"
                                className="absolute inset-0 h-full w-full bg-black object-contain"
                                aria-label={item.description ?? stage.stage}
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Play
                                  className="h-5 w-5 text-graphite"
                                  fill="currentColor"
                                  aria-hidden="true"
                                />
                              </div>
                            )
                          ) : isValidUrl(imageUrl) ? (
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
                    {cLocale.projects.noPhotos}
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
