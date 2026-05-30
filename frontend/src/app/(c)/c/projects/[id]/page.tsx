"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Share } from "lucide-react";
import useSWR from "swr";
import { ImageCarousel } from "@/components/c/project/ImageCarousel";
import { PropertyGrid } from "@/components/c/project/PropertyGrid";
import { RenovationTimeline } from "@/components/c/project/RenovationTimeline";
import { ConsultantBar } from "@/components/c/project/ConsultantBar";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/c/shared/ErrorState";

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  "在售": {
    label: "在售",
    className: "bg-c-status-onsale/10 text-c-status-onsale",
  },
  "在途": {
    label: "在途",
    className: "bg-c-status-upcoming/10 text-c-status-upcoming",
  },
  "已售": {
    label: "已售",
    className: "bg-c-status-sold/10 text-c-status-sold",
  },
};

interface ProjectDetail {
  id: number;
  community_name: string | null;
  layout: string;
  orientation: string;
  area: number;
  total_price: number;
  unit_price: number;
  floor_info: string;
  decoration_style: string | null;
  project_status: string;
  images: string[];
  renovation_stages: { stage: string; photo_count: number }[];
  media: {
    id: number;
    file_url: string;
    thumbnail_url: string | null;
    media_type: string;
    photo_category: string;
    renovation_stage: string | null;
    description: string | null;
    sort_order: number;
  }[];
}

interface ConsultantInfo {
  wechat_number: string;
  phone: string;
}

async function fetchJSON<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch");
  return res.json();
}

export default function ProjectDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const { data, error, isLoading, mutate } = useSWR<ProjectDetail>(
    id ? `/api/v1/public/projects/${id}` : null,
    fetchJSON
  );

  const { data: consultant } = useSWR<ConsultantInfo>(
    id ? `/api/v1/public/projects/${id}/consultant` : null,
    fetchJSON
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="w-full aspect-video" />
        <div className="px-4 space-y-4">
          <Skeleton className="h-6 w-1/4" />
          <Skeleton className="h-8 w-3/4" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
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

  const carouselImages =
    data.images && data.images.length > 0
      ? data.images
      : (data.media ?? [])
          .filter((m) => m.media_type === "image" && m.file_url)
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((m) => m.file_url);

  return (
    <div className="pb-24 md:pb-20">
      <nav className="fixed top-0 left-0 w-full z-50 flex justify-between items-center px-4 h-16 pointer-events-none">
        <button
          onClick={() => router.back()}
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-md text-c-trust-blue shadow-sm pointer-events-auto active:scale-95 transition-transform"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <button className="w-10 h-10 flex items-center justify-center rounded-full bg-white/80 backdrop-blur-md text-c-trust-blue shadow-sm pointer-events-auto active:scale-95 transition-transform">
          <Share className="w-5 h-5" />
        </button>
      </nav>
      <ImageCarousel images={carouselImages} />

      <section className="px-4 pt-4 space-y-2">
        <span
          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${status.className}`}
        >
          {status.label}
        </span>
        <h1 className="text-xl font-bold text-c-trust-blue">
          {data.community_name ?? "未知小区"}
        </h1>
      </section>

      <section className="px-4 pt-4">
        <PropertyGrid
          totalPrice={data.total_price}
          unitPrice={data.unit_price}
          orientation={data.orientation}
          floorInfo={data.floor_info}
          decorationStyle={data.decoration_style}
          layout={data.layout}
          area={data.area}
        />
      </section>

      <section className="px-4 pt-6">
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
