"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { getFileUrl } from "@/lib/config";
import type { L4MarketingMedia } from "../../types";

interface PhotoGalleryProps {
  photos: L4MarketingMedia[];
}

export function PhotoGallery({ photos }: PhotoGalleryProps) {
  if (photos.length === 0) {
    return <div className="text-sm text-slate-400">暂无照片</div>;
  }

  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
      {photos
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .map((p) => {
          const url = p.file_url || p.thumbnail_url;
          return (
            <div
              key={p.id}
              className="relative aspect-square rounded-lg border border-slate-200 bg-slate-50 overflow-hidden group"
            >
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{
                  backgroundImage: url ? `url(${getFileUrl(url)})` : "none",
                }}
              />
              <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between gap-1">
                <Badge
                  variant="secondary"
                  className="text-[10px] bg-black/50 text-white border-0"
                >
                  {(p.renovation_stage || "other").slice(0, 8)}
                </Badge>
                <Badge
                  variant="secondary"
                  className="text-[10px] bg-black/50 text-white border-0"
                >
                  #{(p.sort_order ?? 0) + 1}
                </Badge>
              </div>
            </div>
          );
        })}
    </div>
  );
}
