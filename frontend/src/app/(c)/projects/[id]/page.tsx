"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import { ArrowLeft, Share } from "lucide-react";
import { toast } from "sonner";
import useSWR from "swr";
import { ImageCarousel } from "@/components/c/project/ImageCarousel";
import { PropertyGrid } from "@/components/c/project/PropertyGrid";
import { RenovationTimeline } from "@/components/c/project/RenovationTimeline";
import { ConsultantBar } from "@/components/c/project/ConsultantBar";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/c/shared/ErrorState";
import { publicFetcher } from "@/lib/swr";
import { cLocale } from "@/lib/i18n/c-locale";
import type { components } from "@/lib/api-types";

type ProjectDetail = components["schemas"]["PublicProjectDetail"];
type ConsultantInfo = components["schemas"]["PublicConsultantContact"];

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  "在售": {
    label: cLocale.common.status.onSale,
    className: "bg-rust/10 text-rust",
  },
  "在途": {
    label: cLocale.common.status.inTransit,
    className: "bg-graphite/10 text-graphite",
  },
  "已售": {
    label: cLocale.common.status.sold,
    className: "bg-dove/10 text-dove",
  },
};

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const { data, error, isLoading, mutate } = useSWR<ProjectDetail>(
    id ? `/api/v1/public/projects/${id}` : null,
    publicFetcher
  );

  const { data: consultant } = useSWR<ConsultantInfo>(
    id ? `/api/v1/public/projects/${id}/consultant` : null,
    publicFetcher
  );

  const handleShare = useCallback(async () => {
    if (!data) return;
    const url = window.location.href;
    const title = `${data.community_name ?? cLocale.projects.shareFallback} · ${data.layout}`;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success(cLocale.projects.linkCopied);
      }
    } catch {
      toast.error(cLocale.projects.shareFailed);
    }
  }, [data]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="w-full aspect-video" />
        <div className="px-4 space-y-4">
          <Skeleton className="h-6 w-1/4" />
          <Skeleton className="h-8 w-3/4" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-cards" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return <ErrorState onRetry={() => mutate()} />;
  }

  const status = STATUS_MAP[data.project_status] ?? STATUS_MAP["已售"];

  const marketingImages = (data.media ?? [])
    .filter((m) => m.media_type === "image" && m.photo_category === "marketing" && m.file_url)
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((m) => m.file_url);

  const carouselImages =
    marketingImages.length > 0
      ? marketingImages
      : (data.images && data.images.length > 0 ? data.images : []);

  return (
    <div className="pb-24 md:pb-20">
      {/* Top floating nav — back + share */}
      <nav className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-4 h-16 pointer-events-none">
        <button
          onClick={handleBack}
          aria-label={cLocale.projects.backAria}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-md text-ink shadow-steep-sm pointer-events-auto active:scale-95 focus-visible:ring-2 focus-visible:ring-ink/20 transition-[transform]"
          style={{ touchAction: "manipulation" }}
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
        </button>
        <button
          onClick={handleShare}
          aria-label={cLocale.projects.shareAria}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-md text-ink shadow-steep-sm pointer-events-auto active:scale-95 focus-visible:ring-2 focus-visible:ring-ink/20 transition-[transform]"
          style={{ touchAction: "manipulation" }}
        >
          <Share className="w-5 h-5" aria-hidden="true" />
        </button>
      </nav>

      <ImageCarousel images={carouselImages} />

      {/* Hero info block — Signifier heading per DESIGN.md */}
      <div className="mx-auto max-w-[1200px] px-4 pt-6 space-y-2">
        <span
          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${status.className}`}
        >
          {status.label}
        </span>
        <h1 className="text-[26px] md:text-[44px] font-display text-ink leading-heading-sm md:leading-heading tracking-heading-sm md:tracking-heading text-wrap-balance">
          {data.community_name ?? cLocale.projects.unknownCommunity}
        </h1>
        <p className="text-[16px] text-ash leading-body tracking-body">
          {cLocale.projects.valueProposition}
        </p>
      </div>

      {/* Property specs — white cards on fog canvas per DESIGN.md */}
      <section className="mx-auto max-w-[1200px] px-4 pt-6">
        <PropertyGrid
          totalPrice={data.total_price}
          unitPrice={data.unit_price}
          orientation={data.orientation}
          floorInfo={data.floor_info}
          decorationStyle={data.decoration_style ?? null}
          layout={data.layout}
          area={data.area}
        />
      </section>

      {/* Renovation timeline section */}
      <section className="mx-auto max-w-[1200px] px-4 pt-8">
        <RenovationTimeline
          stages={data.renovation_stages ?? []}
          media={data.media ?? []}
        />
      </section>

      {consultant && (
        <ConsultantBar
          wechatNumber={consultant.wechat_number}
          phone={consultant.phone}
        />
      )}
    </div>
  );
}
