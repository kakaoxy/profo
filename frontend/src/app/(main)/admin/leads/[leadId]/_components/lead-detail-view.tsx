"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Lead, FollowUp } from "../../types";
import { isValidUrl } from "@/lib/validators";
import { getStatusStyleConfig } from "@/lib/status-colors";
import { LeadImageGallery } from "./lead-image-gallery";
import { LeadBasicInfo } from "./lead-basic-info";
import { LeadTrajectoryTimeline } from "./lead-trajectory-timeline";
import { LeadImageLightbox } from "./lead-image-lightbox";
import { LeadFollowUpForm } from "./lead-follow-up-form";

interface LeadDetailViewProps {
  lead: Lead;
  initialFollowUps: FollowUp[];
}

export function LeadDetailView({ lead, initialFollowUps }: LeadDetailViewProps) {
  const router = useRouter();
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [followUps, setFollowUps] =
    useState<FollowUp[]>(initialFollowUps);

  const statusConfig = getStatusStyleConfig(lead.status);

  // 统一过滤图片 URL（仅允许 http/https 与相对路径），保证 gallery 与 lightbox 索引一致
  const safeImages = useMemo(
    () =>
      (lead.images || []).filter(
        (src) => typeof src === "string" && isValidUrl(src),
      ),
    [lead.images],
  );

  return (
    <div className="flex flex-1 flex-col bg-muted/30">
      {/* 顶部 sticky 返回栏 */}
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card/80 px-2 backdrop-blur-xl">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-muted"
          aria-label="返回"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="flex-1 truncate text-base font-semibold text-foreground">
          {lead.communityName || "线索详情"}
        </span>
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold whitespace-nowrap ${statusConfig.className}`}
        >
          {statusConfig.label}
        </span>
      </header>

      {/* 主体内容 */}
      <main className="max-w-2xl mx-auto w-full px-3 py-4 space-y-4">
        <LeadImageGallery
          images={safeImages}
          onImageClick={(i) => setLightboxIndex(i)}
        />
        <LeadBasicInfo lead={lead} />
        <LeadTrajectoryTimeline lead={lead} followUps={followUps} />
        <LeadFollowUpForm
          leadId={lead.id}
          onFollowUpsChange={setFollowUps}
        />
      </main>

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <LeadImageLightbox
          images={safeImages}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
}
