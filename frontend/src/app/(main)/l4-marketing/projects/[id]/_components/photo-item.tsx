"use client";

import { L4MarketingMedia } from "../../types";
import { getFileUrl } from "@/lib/config";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

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
  const stageLabels: Record<string, string> = {
    other: "其他",
    拆除: "拆除阶段",
    水电: "水电阶段",
    木瓦: "木瓦阶段",
    油漆: "油漆阶段",
    安装: "安装阶段",
    交付: "交付阶段",
  };

  const stage = photo.renovation_stage || "other";
  const displayUrl = photo.file_url || photo.thumbnail_url;

  return (
    <div className="flex items-center gap-4 rounded-lg border bg-muted/20 p-3 hover:bg-background transition-colors">
      <div
        className="w-12 h-12 rounded-md bg-cover bg-center border shrink-0 relative"
        style={{ backgroundImage: `url(${getFileUrl(displayUrl)})` }}
      >
        <Badge
          className={cn(
            "absolute -top-2 -right-2 px-2 py-0.5",
            isSynced ? "" : "bg-emerald-600 text-white",
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
          阶段: {stageLabels[stage] || stageLabels.other}
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
