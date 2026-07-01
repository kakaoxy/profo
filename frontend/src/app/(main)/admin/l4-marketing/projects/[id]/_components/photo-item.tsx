"use client";

import { L4MarketingMedia, RENOVATION_STAGES } from "../../types";
import { getFileUrl } from "@/lib/config";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, Loader2 } from "lucide-react";
import { useSimpleImageLoader } from "../../_components/common/hooks";

interface PhotoItemProps {
  photo: L4MarketingMedia;
  index: number;
  onDelete: (photoId: number) => void;
  isSynced?: boolean;
}

export function PhotoItem({
  photo,
  index,
  onDelete,
  isSynced = true,
}: PhotoItemProps) {
  const stageLabels: Record<string, string> = Object.fromEntries(
    RENOVATION_STAGES.map((s) => [s.value, s.label]),
  );

  const stage = photo.renovation_stage || "";
  const displayUrl = photo.file_url || photo.thumbnail_url;
  const { status: imageStatus } = useSimpleImageLoader(
    displayUrl ? getFileUrl(displayUrl) : null
  );

  return (
    <div className="flex items-center gap-4 rounded-lg border bg-muted/20 p-3 hover:bg-background transition-colors">
      <div
        className="w-12 h-12 rounded-md border shrink-0 relative overflow-hidden bg-muted"
      >
        {imageStatus === "loading" && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {displayUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={getFileUrl(displayUrl)}
            alt={`照片 #${photo.id}`}
            className={cn(
              "w-full h-full object-cover transition-opacity duration-300",
              imageStatus === "loaded" ? "opacity-100" : "opacity-0"
            )}
            loading="lazy"
            decoding="async"
          />
        )}
        {imageStatus === "error" && (
          <div className="absolute inset-0 flex items-center justify-center text-[8px] text-muted-foreground">
            加载失败
          </div>
        )}
        <Badge
          className={cn(
            "absolute -top-2 -right-2 px-2 py-0.5",
            isSynced ? "" : "bg-success text-white",
          )}
        >
          {isSynced ? "同步" : "上传"}
        </Badge>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">
          照片 #{photo.id}
        </p>
        <p className="text-xs text-muted-foreground">
          阶段: {stageLabels[stage] || stage || "—"}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant="outline" className="rounded-md">
          #{index + 1}
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onDelete(photo.id)}
          aria-label="删除照片"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
