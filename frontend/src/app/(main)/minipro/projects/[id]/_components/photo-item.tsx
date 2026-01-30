"use client";

import { MiniProjectPhoto } from "../../types";
import { getFileUrl } from "@/lib/config";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

interface PhotoItemProps {
  photo: MiniProjectPhoto;
  index: number;
  onDelete: (photoId: string) => void;
  isSynced?: boolean;
}

export function PhotoItem({
  photo,
  index,
  onDelete,
  isSynced = true,
}: PhotoItemProps) {
  const stageLabels: Record<string, string> = {
    设计: "设计阶段",
    拆除: "拆除阶段",
    水电: "水电阶段",
    木瓦: "木瓦阶段",
    油漆: "油漆阶段",
    安装: "安装阶段",
    交付: "交付阶段",
    已完成: "已完成阶段",
  };

  const stage = photo.renovation_stage || "other";

  return (
    <div className="flex items-center gap-4 rounded-lg border bg-muted/20 p-3 hover:bg-background transition-colors">
      <div
        className="w-12 h-12 rounded-md bg-cover bg-center border shrink-0 relative"
        style={{ backgroundImage: `url(${getFileUrl(photo.image_url)})` }}
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
          {photo.id.slice(0, 8)}
        </p>
        <p className="text-xs text-muted-foreground">
          阶段: {stageLabels[stage] || "未设置"}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Badge variant="outline" className="rounded-md">
          #{index + 1}
        </Badge>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onDelete(photo.id)}
          aria-label="删除照片"
        >
          <Trash2 />
        </Button>
      </div>
    </div>
  );
}
