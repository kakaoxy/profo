"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { Project, RenovationPhoto } from "../../../../types";
import { RENOVATION_STAGES } from "../../constants";
import { safeFormatDate } from "@/lib/formatters";
import { getThumbnailUrl } from "../../utils";
import { isValidUrl } from "@/lib/validators";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { StagePhotoItem } from "./components/stage-photo-item";
import { LazyPhoto } from "./components/lazy-photo";
import { SummaryReport } from "./components/summary-report";

export { SummaryReport };

/** 对比网格单张：固定高度封面图 + 双行 caption（{名称} · 装修前/后 + {日期} · {阶段描述}） */
function CompareTile({
  photo,
  stageName,
  tag,
}: {
  photo: RenovationPhoto;
  stageName: string;
  tag: string;
}) {
  const displayUrl = getThumbnailUrl(photo.thumbnail_url, photo.url);
  const desc = photo.description?.trim() || null;
  const name = desc || stageName;
  const dateText = safeFormatDate(photo.created_at, "yyyy.MM.dd", "");

  return (
    <div>
      <div className="relative h-[170px] w-full overflow-hidden rounded-2xl bg-fog">
        {isValidUrl(displayUrl) ? (
          <Image
            src={displayUrl}
            alt={`${name} · ${tag}`}
            fill
            sizes="(max-width: 768px) 100vw, 400px"
            loading="lazy"
            unoptimized
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-dove">
            <ImageIcon className="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="mt-2 text-center">
        <div className="text-[13px] font-[450] text-ink">
          {name} · {tag}
        </div>
        {(dateText || desc) && (
          <div className="mt-0.5 text-[12.5px] font-[430] text-graphite">
            {[dateText, desc ? stageName : null].filter(Boolean).join(" · ")}
          </div>
        )}
      </div>
    </div>
  );
}

export function VisualJourney({ project }: { project: Project }) {
  const photos = project.renovation_photos || [];
  const stageDates = project.renovationStageDates || {};
  const [allPhotosOpen, setAllPhotosOpen] = useState(false);

  const stagesWithPhotos = RENOVATION_STAGES.map((stage) => {
    const stagePhotos = photos.filter((p) => p.stage === stage.value || p.stage === stage.key);
    const date = stageDates[stage.value];
    return {
      ...stage,
      photos: stagePhotos,
      date: date || null,
    };
  }).filter((s) => s.photos.length > 0);

  const totalPhotos = photos.length;

  // 装修前 = 最早有照阶段（拆除优先），装修后 = 最晚有照阶段（交付优先），各取 2 张
  const beforeStage = stagesWithPhotos[0];
  const afterStage = stagesWithPhotos[stagesWithPhotos.length - 1];
  const canCompare =
    !!beforeStage &&
    !!afterStage &&
    beforeStage.key !== afterStage.key &&
    beforeStage.photos.length > 0 &&
    afterStage.photos.length > 0;

  return (
    <div className="rounded-cards bg-pure-white p-6 shadow-steep-sm">
      {/* 卡头：标题 + 副标题计数 + 查看全部照片 */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-base font-[500] text-ink">视觉旅程</div>
          <div className="mt-0.5 text-[13px] font-[430] text-graphite">
            装修前后对比 · 完整相册 {totalPhotos} 张
          </div>
        </div>
        {totalPhotos > 0 && (
          <button
            type="button"
            onClick={() => setAllPhotosOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[#e2e2e5] bg-white px-3.5 py-1.5 text-[13.5px] font-[450] text-ink transition-colors hover:border-dove hover:bg-[#fafafa]"
          >
            查看全部照片
          </button>
        )}
      </div>

      {canCompare ? (
        /* 2×2 前后对比网格（<md 单列） */
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
          {beforeStage!.photos.slice(0, 2).map((photo) => (
            <CompareTile key={photo.id} photo={photo} stageName={beforeStage!.value} tag="装修前" />
          ))}
          {afterStage!.photos.slice(0, 2).map((photo) => (
            <CompareTile key={photo.id} photo={photo} stageName={afterStage!.value} tag="装修后" />
          ))}
        </div>
      ) : (
        /* 回退：前后对比照片不足（至少需 1 前 1 后），保留原横向展示 */
        <ScrollArea className="w-full whitespace-nowrap">
          <div className="flex gap-6 pb-2">
            {stagesWithPhotos.length > 0 ? (
              stagesWithPhotos.map((stage, idx) => (
                <div key={stage.key}>
                  <StagePhotoItem
                    photo={stage.photos[0]}
                    stageLabel={stage.label}
                    photoCount={stage.photos.length}
                    allPhotos={stage.photos}
                  />
                  <div className="mt-4 space-y-1 pl-1">
                    <div className="flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-card" />
                      <span className="text-sm font-bold text-muted-foreground">
                        {idx + 1}. {stage.value}
                        {stage.label.includes("阶段") ? "" : "阶段"}
                      </span>
                    </div>
                    <p className="pl-3 font-mono text-[11px] text-muted-foreground">
                      ({safeFormatDate(stage.date, "MM/dd", "--/--")})
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex w-full flex-col items-center justify-center py-12 text-muted-foreground">
                <ImageIcon className="mb-2 h-8 w-8 opacity-30" />
                <span className="text-xs">暂无影像记录</span>
              </div>
            )}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      )}

      {/* 全部阶段照片弹窗 */}
      <Dialog open={allPhotosOpen} onOpenChange={setAllPhotosOpen}>
        <DialogContent className="max-w-4xl overflow-hidden rounded-cards p-0">
          <DialogHeader className="px-6 pt-6 pb-2">
            <DialogTitle>全部装修照片（{totalPhotos} 张）</DialogTitle>
            <DialogDescription>按装修阶段浏览完整影像记录。</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh]">
            <div className="space-y-6 px-6 pb-6">
              {stagesWithPhotos.map((stage) => (
                <div key={stage.key}>
                  <div className="mb-2 text-sm font-[500] text-ink">
                    {stage.label}
                    <span className="ml-1.5 text-xs font-[430] text-graphite">
                      （{stage.photos.length} 张）
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                    {stage.photos.map((p, i) => (
                      <LazyPhoto key={p.id} photo={p} index={i} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}
