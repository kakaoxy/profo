"use client";

import * as React from "react";
import { Image, Video, AlertCircle } from "lucide-react";
import { cn, escapeHtml } from "@/lib/utils";
import { getFileUrl } from "@/lib/config";
import { isVideoFile } from "@/lib/media-utils";
import type { ImportableMedia } from "./types";

interface MediaItemProps {
  media: ImportableMedia;
  selected: boolean;
  onToggle: () => void;
}

/**
 * 媒体项组件
 */
export function MediaItem({ media, selected, onToggle }: MediaItemProps) {
  const [loadState, setLoadState] = React.useState<
    "loading" | "loaded" | "error"
  >("loading");
  const [imageUrl, setImageUrl] = React.useState<string | undefined>(undefined);

  // 处理URL并检测媒体类型
  React.useEffect(() => {
    const rawUrl = media.thumbnail_url || media.file_url;
    const fullUrl = getFileUrl(rawUrl);
    setImageUrl(fullUrl);
    setLoadState("loading");
  }, [media.thumbnail_url, media.file_url]);

  const isVideo = media.media_type === "video" || isVideoFile(media.file_url);

  return (
    <div
      onClick={onToggle}
      className={cn(
        "relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all",
        selected ? "border-blue-500" : "border-transparent"
      )}
    >
      {imageUrl ? (
        <>
          <img
            src={imageUrl}
            alt={escapeHtml(media.description) || "媒体资源"}
            className={cn(
              "w-full h-full object-cover transition-opacity duration-200",
              loadState === "loaded" ? "opacity-100" : "opacity-0"
            )}
            onLoad={() => setLoadState("loaded")}
            onError={() => setLoadState("error")}
            loading="lazy"
          />

          {/* 加载状态 */}
          {loadState === "loading" && (
            <div className="absolute inset-0 bg-slate-100 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
            </div>
          )}

          {/* 错误状态 */}
          {loadState === "error" && (
            <div className="absolute inset-0 bg-slate-100 flex flex-col items-center justify-center p-2">
              <AlertCircle className="w-6 h-6 text-slate-400 mb-1" />
              <span className="text-xs text-slate-500 text-center">加载失败</span>
            </div>
          )}
        </>
      ) : (
        <div className="w-full h-full bg-slate-100 flex flex-col items-center justify-center">
          {isVideo ? (
            <Video className="w-8 h-8 text-slate-300" />
          ) : (
            <Image className="w-8 h-8 text-slate-300" />
          )}
        </div>
      )}

      {/* 视频标识 */}
      {isVideo && (
        <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-black/60 flex items-center justify-center">
          <Video className="w-3 h-3 text-white" />
        </div>
      )}

      {/* 选中标记 */}
      {selected && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
          <svg
            className="w-3 h-3 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={3}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
      )}

      {/* 阶段标签 */}
      {media.renovation_stage && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs px-2 py-1 truncate">
          {media.renovation_stage}
        </div>
      )}
    </div>
  );
}
