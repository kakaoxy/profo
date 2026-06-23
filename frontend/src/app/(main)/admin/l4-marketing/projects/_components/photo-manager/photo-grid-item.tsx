"use client";

import { cn } from "@/lib/utils";
import { getFileUrl } from "@/lib/config";
import { Check } from "lucide-react";
import { useSimpleImageLoader } from "../common/hooks";
import type { RenovationPhoto } from "./types";

interface PhotoGridItemProps {
  photo: RenovationPhoto;
  isSelected: boolean;
  isExisting: boolean;
  onToggle: () => void;
}

export function PhotoGridItem({ photo, isSelected, isExisting, onToggle }: PhotoGridItemProps) {
  const { status: imageStatus } = useSimpleImageLoader(getFileUrl(photo.url));

  return (
    <div
      className={cn(
        'relative p-2 rounded-xl border-2 cursor-pointer transition-all',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50',
        isExisting && 'opacity-50'
      )}
      onClick={() => !isExisting && onToggle()}
    >
      {isSelected ? (
        <div className="absolute top-3 right-3 z-10 bg-primary text-white rounded-full p-0.5">
          <Check className="w-3 h-3" />
        </div>
      ) : null}
      {!isSelected && !isExisting ? (
        <div className="absolute top-3 right-3 z-10 w-5 h-5 border-2 border-border bg-card/80 rounded-full" />
      ) : null}
      {isExisting ? (
        <div className="absolute top-3 right-3 z-10 bg-status-selling text-white text-[8px] font-bold px-1.5 py-0.5 rounded">
          已添加
        </div>
      ) : null}
      <div
        className="w-full aspect-square rounded-lg bg-center mb-2 overflow-hidden relative bg-muted"
      >
        {imageStatus === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-border border-t-primary rounded-full animate-spin" />
          </div>
        )}
        {imageStatus === "error" && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            加载失败
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={getFileUrl(photo.url)}
          alt={photo.description || `Photo ${photo.id}`}
          loading="lazy"
          decoding="async"
          className={cn(
            "w-full h-full object-cover transition-opacity duration-200",
            imageStatus === "loaded" ? "opacity-100" : "opacity-0"
          )}
        />
      </div>
      <div className="px-1">
        <p className="text-xs font-bold truncate">
          ID: #{photo.id}
        </p>
        <p className="text-[10px] text-muted-foreground truncate">
          {photo.description || photo.stage}
        </p>
      </div>
    </div>
  );
}
