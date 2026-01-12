"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus } from "lucide-react";
import { PhotoPicker } from "@/components/ui/photo-picker";
import { getFileUrl } from "@/lib/config";
import { MiniProjectPhoto } from "@/app/(main)/minipro/projects/types";

interface PhotosSectionProps {
  projectId: string;
  photos: MiniProjectPhoto[];
  onAddByUrl: () => void;
  onSelectFromSource: (photo: { url: string; renovation_stage?: string }) => void;
  onDelete: (id: string) => void;
}

export function PhotosSection({ 
  projectId,
  photos, 
  onAddByUrl, 
  onSelectFromSource, 
  onDelete 
}: PhotosSectionProps) {
  const getStageLabel = (stage?: string | null) => {
    switch (stage) {
      case "signing": return "合约";
      case "renovating": return "装修";
      case "selling": return "在售";
      case "sold": return "成交";
      default: return "其他";
    }
  };

  return (
    <Card className="flex flex-col h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>项目相册</CardTitle>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onAddByUrl}>
            <Plus className="mr-2 h-4 w-4" /> 外部 URL
          </Button>
          <PhotoPicker 
            title="从关联项目选择"
            projectId={projectId} 
            onSelect={onSelectFromSource}
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {photos.map((photo) => (
            <div key={photo.id} className="group relative aspect-square rounded overflow-hidden border bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={getFileUrl(photo.image_url || "")} alt="mini" className="w-full h-full object-cover" />
              <div className="absolute top-2 left-2">
                <Badge variant="secondary" className="bg-black/50 text-white border-0 text-xs">
                  {getStageLabel(photo.renovation_stage)}
                </Badge>
              </div>
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onDelete(photo.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <div className="absolute bottom-2 right-2 text-white text-xs bg-black/50 px-1 rounded opacity-0 group-hover:opacity-100">
                排序: #{photo.sort_order}
              </div>
            </div>
          ))}
          {photos.length === 0 && (
            <div className="col-span-full h-32 flex items-center justify-center border-2 border-dashed rounded text-muted-foreground italic text-sm">
              暂无照片
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
