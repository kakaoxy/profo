"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Layers3,
  Maximize2,
  Ruler,
  UserRound,
} from "lucide-react";

import { formatArea, formatPrice, formatUnitPrice, safeFormatDate } from "@/lib/formatters";
import { getFileUrl, getThumbnailUrl } from "@/lib/config";
import type { L4MarketingMedia, L4MarketingProject } from "@/app/(main)/admin/marketing/types";
import { PriceChangeCard } from "../price-change-card";
import { ViewStatCard } from "../view-stat-card";
import { RENOVATION_STAGES } from "../../types";

interface ListingDetailViewProps {
  project: L4MarketingProject;
  photos: L4MarketingMedia[];
  onPriceChanged: () => void;
}

function SectionHeading({ kicker, title, meta }: { kicker: string; title: string; meta?: string }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-graphite">
          {kicker}
        </div>
        <h2 className="mt-1.5 font-display text-[26px] leading-none tracking-[-0.02em] text-ink">
          {title}
        </h2>
      </div>
      {meta ? <span className="text-[10px] text-dove">{meta}</span> : null}
    </div>
  );
}

function InfoCell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-[0.08em] text-graphite">{label}</div>
      <div className="mt-1.5 truncate text-[13px] font-medium text-ink">{children}</div>
    </div>
  );
}

function StatusPill({ children, tone = "fog" }: { children: ReactNode; tone?: "fog" | "rust" | "ink" }) {
  const cls =
    tone === "rust" ? "bg-rust text-white" : tone === "ink" ? "bg-ink text-white" : "bg-fog text-graphite";
  return (
    <span className={`inline-flex h-6 items-center rounded-full px-2.5 text-[10px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

function getPhotoUrl(photo: L4MarketingMedia): string {
  return getThumbnailUrl(photo.thumbnail_url, photo.file_url);
}

function sortPhotos(photos: L4MarketingMedia[]): L4MarketingMedia[] {
  return [...photos].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

export function ListingDetailView({
  project,
  photos,
  onPriceChanged,
}: ListingDetailViewProps) {
  const marketingPhotos = useMemo(
    () => sortPhotos(photos.filter((photo) => photo.photo_category === "marketing")),
    [photos],
  );
  const renovationPhotos = useMemo(
    () => sortPhotos(photos.filter((photo) => photo.photo_category === "renovation")),
    [photos],
  );
  const fallbackPhotos = useMemo(
    () => (project.images ?? []).map((url, index) => ({ id: -index - 1, url, thumb: url })),
    [project.images],
  );

  const gallery = useMemo(() => {
    const photos = [
      ...marketingPhotos.map((photo) => ({
        id: String(photo.id),
        url: getPhotoUrl(photo),
        label: "营销照片",
      })),
      ...renovationPhotos.map((photo) => ({
        id: String(photo.id),
        url: getPhotoUrl(photo),
        label: "改造照片",
      })),
    ];
    if (photos.length > 0) return photos;
    return fallbackPhotos.map((photo) => ({
      id: `fallback-${photo.id}`,
      url: getFileUrl(photo.url),
      label: "房源图片",
    }));
  }, [fallbackPhotos, marketingPhotos, renovationPhotos]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [photoTab, setPhotoTab] = useState<"marketing" | "renovation">(
    marketingPhotos.length > 0 ? "marketing" : "renovation",
  );
  const safeActiveIndex = Math.min(activeIndex, Math.max(gallery.length - 1, 0));
  const currentPhoto = gallery[safeActiveIndex];
  const tabPhotos = photoTab === "marketing" ? marketingPhotos : renovationPhotos;

  const stageEntries = useMemo(
    () =>
      RENOVATION_STAGES.filter((stage) => stage.value !== "已完成").map((stage) => ({
        label: stage.label.replace("阶段", ""),
        date: project.stage_completed_dates?.[stage.value] ?? null,
      })),
    [project.stage_completed_dates],
  );
  const completedStages = stageEntries.filter((entry) => Boolean(entry.date)).length;

  return (
    <div className="mx-auto max-w-[1200px] px-4 pt-5 pb-16 sm:px-6 lg:px-8">
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_344px]">
        <div className="min-w-0 space-y-5">
          <section id="listing-gallery" className="overflow-hidden rounded-cards bg-white shadow-steep-sm">
            <div className="relative aspect-[4/3] max-h-[392px] w-full overflow-hidden bg-fog">
              {currentPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={currentPhoto.url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full min-h-[280px] w-full items-center justify-center text-dove">
                  <ImageIcon className="h-10 w-10" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-ink/25 via-transparent to-transparent" />
              <div className="absolute top-4 left-4 flex gap-2">
                <span className="inline-flex h-6 items-center rounded-full bg-ink/75 px-2.5 text-[10px] font-medium text-white">
                  {currentPhoto?.label ?? "房源图片"}
                </span>
                <StatusPill tone={project.publish_status === "发布" ? "rust" : "fog"}>
                  {project.publish_status === "发布" ? "已发布" : "草稿"}
                </StatusPill>
              </div>
              {gallery.length > 1 ? (
                <>
                  <button
                    type="button"
                    aria-label="上一张图片"
                    onClick={() => setActiveIndex((value) => (value - 1 + gallery.length) % gallery.length)}
                    className="absolute top-1/2 left-4 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/75 text-ink backdrop-blur hover:bg-white"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="下一张图片"
                    onClick={() => setActiveIndex((value) => (value + 1) % gallery.length)}
                    className="absolute top-1/2 right-4 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/75 text-ink backdrop-blur hover:bg-white"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </>
              ) : null}
              <div className="absolute right-4 bottom-4 inline-flex items-center gap-1.5 rounded-full bg-ink/65 px-2.5 py-1 text-[10px] text-white backdrop-blur">
                <Maximize2 className="h-3 w-3" />
                {safeActiveIndex + 1}/{Math.max(gallery.length, 1)}
              </div>
            </div>
            {gallery.length > 0 ? (
              <div className="flex items-center gap-2 overflow-x-auto px-4 py-3">
                {gallery.map((photo, index) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setActiveIndex(index)}
                    aria-label={`查看第 ${index + 1} 张图片`}
                    className={`relative h-12 w-[66px] shrink-0 overflow-hidden rounded-images border-2 transition-colors ${
                      index === safeActiveIndex ? "border-ink" : "border-transparent"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photo.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
                <button
                  type="button"
                  className="ml-auto inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-rust hover:underline"
                  onClick={() => {
                    const el = document.querySelector<HTMLElement>("[data-listing-photos]");
                    el?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  全部照片
                  <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            ) : null}
          </section>

          <section className="rounded-cards bg-white p-6 shadow-steep-sm">
            <SectionHeading kicker="Listing dossier" title="房源档案" meta={`ID ${project.id}`} />

            <div className="mt-5 grid grid-cols-2 divide-x divide-dove/30 rounded-2xl bg-fog/60 py-4 sm:grid-cols-4">
              {[
                { icon: <Layers3 className="h-3.5 w-3.5" />, label: "户型", value: project.layout || "—" },
                { icon: <Ruler className="h-3.5 w-3.5" />, label: "建筑面积", value: formatArea(project.area) },
                { icon: <Building2 className="h-3.5 w-3.5" />, label: "楼层", value: project.floor_info || "—" },
                { icon: <ArrowUpRight className="h-3.5 w-3.5" />, label: "朝向", value: project.orientation || "—" },
              ].map((item) => (
                <div key={item.label} className="flex flex-col items-center px-2 text-center">
                  <div className="flex items-center gap-1.5 text-[10px] text-graphite">
                    {item.icon}
                    {item.label}
                  </div>
                  <div className="mt-2 text-[13px] font-medium text-ink">{item.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              <InfoCell label="总价">
                <span className="font-display text-[22px] text-rust">{formatPrice(project.total_price)}</span>
              </InfoCell>
              <InfoCell label="单价">{formatUnitPrice(project.unit_price)}</InfoCell>
              <InfoCell label="小区">{project.community_name || "—"}</InfoCell>
              <InfoCell label="楼栋 / 户室">
                {[project.building_no, project.room_no].filter(Boolean).join(" · ") || "—"}
                {project.dict_status === "pending" ? (
                  <span className="ml-2 text-[10px] text-amber-700">未审核</span>
                ) : null}
              </InfoCell>
              <InfoCell label="装修风格">{project.decoration_style || "—"}</InfoCell>
              <InfoCell label="创建时间">
                {safeFormatDate(project.created_at, "yyyy.MM.dd")}
              </InfoCell>
            </div>

            {project.tags && project.tags.length > 0 ? (
              <div className="mt-5 flex flex-wrap gap-1.5 border-t border-dove/30 pt-4">
                {project.tags.map((tag) => (
                  <span key={tag} className="rounded-full bg-fog px-2.5 py-1 text-[10px] text-graphite">
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </section>

          <section data-listing-photos className="rounded-cards bg-white p-6 shadow-steep-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <SectionHeading kicker="Photo archive" title="照片档案" meta={`${photos.length} 张`} />
              <div className="flex rounded-full bg-fog p-1">
                {(
                  [
                    ["marketing", "营销照片", marketingPhotos.length],
                    ["renovation", "改造照片", renovationPhotos.length],
                  ] as const
                ).map(([value, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setPhotoTab(value)}
                    className={`inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-[10px] font-medium transition-colors ${
                      photoTab === value ? "bg-ink text-white" : "text-graphite hover:text-ink"
                    }`}
                  >
                    {label}
                    <span className={photoTab === value ? "text-white/60" : "text-dove"}>{count}</span>
                  </button>
                ))}
              </div>
            </div>

            {tabPhotos.length > 0 ? (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {tabPhotos.map((photo) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => {
                      const index = gallery.findIndex((item) => item.id === String(photo.id));
                      if (index >= 0) setActiveIndex(index);
                      document
                        .getElementById("listing-gallery")
                        ?.scrollIntoView({ behavior: "smooth", block: "start" });
                    }}
                    className="group relative aspect-[4/3] overflow-hidden rounded-images bg-fog"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getPhotoUrl(photo)}
                      alt=""
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                    {photo.renovation_stage ? (
                      <span className="absolute bottom-2 left-2 rounded-full bg-ink/65 px-2 py-0.5 text-[9px] text-white">
                        {photo.renovation_stage}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-4 flex min-h-[120px] items-center justify-center rounded-2xl bg-fog text-[11px] text-graphite">
                暂未上传{photoTab === "marketing" ? "营销" : "改造"}照片
              </div>
            )}
          </section>

          <section className="rounded-cards bg-white p-6 shadow-steep-sm">
            <SectionHeading
              kicker="Renovation timeline"
              title="改造进度"
              meta={`${completedStages}/${stageEntries.length} 个阶段已完成`}
            />
            <div className="mt-6 overflow-x-auto pb-1">
              <div className="relative flex min-w-[560px] items-start justify-between gap-2">
                <div className="absolute top-[7px] right-8 left-8 h-px bg-dove/40" />
                {stageEntries.map((stage) => (
                  <div key={stage.label} className="relative z-10 flex flex-1 flex-col items-center text-center">
                    <span
                      className={`h-3.5 w-3.5 rounded-full border-2 ${
                        stage.date ? "border-rust bg-rust" : "border-dove bg-white"
                      }`}
                    />
                    <span className="mt-2 text-[11px] font-medium text-ash">{stage.label}</span>
                    <span className="mt-1 text-[10px] text-graphite">
                      {stage.date ? safeFormatDate(stage.date, "MM.dd") : "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-5">
          <PriceChangeCard
            variant="card"
            project={project}
            onPriceSuccess={() => void onPriceChanged()}
          />
          <ViewStatCard project={project} />
          <section className="rounded-cards bg-white p-5 shadow-steep-sm">
            <SectionHeading kicker="Listing controls" title="管理配置" meta={`排序 ${project.sort_order ?? 0}`} />
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
              <InfoCell label="关联顾问">
                <span className="inline-flex items-center gap-1.5">
                  <UserRound className="h-3.5 w-3.5 text-graphite" />
                  {project.consultant_id || "未分配"}
                </span>
              </InfoCell>
              <InfoCell label="L3 项目 ID">{project.project_id || "—"}</InfoCell>
              <InfoCell label="最后更新">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-graphite" />
                  {safeFormatDate(project.updated_at, "MM.dd HH:mm")}
                </span>
              </InfoCell>
              <InfoCell label="排序权重">{project.sort_order ?? 0}</InfoCell>
            </div>
            <div className="mt-4 border-t border-dove/30 pt-3 text-[10px] leading-relaxed text-dove">
              这里的配置会在保存后同步到客户端展示与营销列表。
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
