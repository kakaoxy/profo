"use client";

import Image from "next/image";
import { differenceInDays, format, isValid, parseISO } from "date-fns";
import { Check, ImageIcon } from "lucide-react";

import { isValidUrl } from "@/lib/validators";
import { Project } from "../../../../types";
import { RENOVATION_STAGES } from "../../constants";
import { getThumbnailUrl } from "../../utils";

interface RenovationArchiveProps {
  project: Project;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = parseISO(value);
  return isValid(date) ? format(date, "yyyy-MM-dd") : value;
}

export function RenovationArchive({ project }: RenovationArchiveProps) {
  const photos = project.renovation_photos ?? [];
  const recentPhotos = [...photos]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 4);
  const stageDates = project.renovationStageDates ?? {};
  const stageValues = RENOVATION_STAGES.map((stage) => stage.value).filter((value) => stageDates[value]);
  const firstDate = stageValues.length > 0 ? parseISO(stageDates[stageValues[0]]) : null;
  const lastDate = stageValues.length > 0 ? parseISO(stageDates[stageValues[stageValues.length - 1]]) : null;
  const renovationDays =
    firstDate && lastDate && isValid(firstDate) && isValid(lastDate)
      ? Math.max(0, differenceInDays(lastDate, firstDate))
      : null;
  const completed =
    project.status === "selling" ||
    project.status === "sold" ||
    project.renovation_stage === "已完成" ||
    Boolean(stageDates["交付"]);
  const investment = Number(project.total_expense ?? 0) > 0 ? Number(project.total_expense) / 10000 : null;

  return (
    <section
      id="project-section-selling-renovation"
      className="mb-5 scroll-mt-28 rounded-cards bg-pure-white p-6 shadow-steep md:p-7"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-[500] text-ink">装修档案</h2>
          {completed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#e5efe7] px-2.5 py-1 text-[10.5px] font-[450] text-[#3e6b4f]">
              <Check className="size-3" />
              验收通过
            </span>
          )}
        </div>
        {photos.length > 0 && (
          <span className="text-[12px] font-[430] text-graphite">共 {photos.length} 张现场照片</span>
        )}
      </div>

      <div className="mt-6 grid grid-cols-3 border-b border-[#f0f0f2] pb-5">
        <div>
          <span className="text-[12px] font-[430] text-graphite">装修周期</span>
          <b className="mt-1 block text-[15px] font-[480] text-ink">
            {renovationDays != null ? `${renovationDays} 天` : "—"}
          </b>
        </div>
        <div className="text-center">
          <span className="text-[12px] font-[430] text-graphite">实际投入</span>
          <b className="mt-1 block text-[15px] font-[480] text-ink">
            {investment != null ? `¥${investment.toFixed(1)} 万` : "—"}
          </b>
        </div>
        <div className="text-right">
          <span className="text-[12px] font-[430] text-graphite">验收日期</span>
          <b className="mt-1 block text-[15px] font-[480] text-ink">{formatDate(stageDates["交付"])}</b>
        </div>
      </div>

      {recentPhotos.length > 0 ? (
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {recentPhotos.map((photo) => {
            const url = getThumbnailUrl(photo.thumbnail_url, photo.url);
            const stage = RENOVATION_STAGES.find(
              (item) => item.value === photo.stage || item.key === photo.stage,
            );
            return (
              <figure key={photo.id}>
                <div className="relative h-[118px] overflow-hidden rounded-[16px] bg-fog">
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
                      <ImageIcon className="size-5" />
                    </div>
                  )}
                </div>
                <figcaption className="mt-2 text-center text-[11px] text-graphite">
                  {stage?.value ?? "现场"} · {photo.created_at.slice(0, 10)}
                </figcaption>
              </figure>
            );
          })}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          {["客厅", "主卧", "厨房", "卫生间"].map((label) => (
            <div key={label} className="grid h-[118px] place-items-center rounded-[16px] border border-dashed border-dove/40 bg-fog/60 text-[11px] text-dove">
              <span className="flex flex-col items-center gap-2">
                <ImageIcon className="size-4" />
                {label} · 暂无照片
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
