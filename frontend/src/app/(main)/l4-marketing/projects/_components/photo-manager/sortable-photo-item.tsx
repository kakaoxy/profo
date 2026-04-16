"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { L4MarketingMedia, PHOTO_CATEGORY_CONFIG } from "../../types";
import { getFileUrl } from "@/lib/config";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Trash2, GripVertical } from "lucide-react";
import { RENOVATION_STAGES } from "../../types";

interface SortablePhotoItemProps {
  photo: L4MarketingMedia;
  index: number;
  onDelete: (photoId: number) => void;
}

export function SortablePhotoItem({
  photo,
  index,
  onDelete,
}: SortablePhotoItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: photo.id,
    data: {
      photo,
      type: 'photo',
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : 1,
  };

  const categoryConfig = PHOTO_CATEGORY_CONFIG[photo.photo_category];
  const stageLabel = RENOVATION_STAGES.find(
    (s) => s.value === photo.renovation_stage
  )?.label;

  const displayUrl = photo.file_url || photo.thumbnail_url;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-white p-3",
        "hover:bg-[#f8faff] transition-colors",
        isDragging && "shadow-lg ring-2 ring-[#005daa] opacity-90"
      )}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-[#e5eeff] rounded"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4 text-[#707785]" />
      </button>

      <div
        className="w-16 h-16 rounded-md bg-cover bg-center border shrink-0 relative"
        style={{ backgroundImage: `url(${getFileUrl(displayUrl)})` }}
      >
        <Badge
          className="absolute -top-2 -right-2 px-1.5 py-0.5 text-[10px]"
          style={{
            backgroundColor: categoryConfig.bgColor,
            color: categoryConfig.color,
            borderColor: categoryConfig.color,
          }}
          variant="outline"
        >
          {categoryConfig.label}
        </Badge>
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-[#0b1c30] truncate">
          照片 #{photo.id}
        </p>
        {photo.photo_category === "renovation" && stageLabel && (
          <p className="text-xs text-[#707785]">{stageLabel}</p>
        )}
      </div>

      <Badge variant="outline" className="rounded-md border-[#c0c7d6]/50 text-[#707785]">
        #{index + 1}
      </Badge>

      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-[#ba1a1a] hover:text-[#ba1a1a] hover:bg-red-50"
        onClick={() => onDelete(photo.id)}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
