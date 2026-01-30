"use client";

import { useState, useEffect, useRef } from "react";
import { MiniProjectPhoto } from "../../types";
import { PhotoItem } from "./photo-item";
import { PhotoLibraryPicker } from "./photo-library-picker";
import { deleteMiniPhotoAction, getSourcePhotosAction } from "../../actions";
import { toast } from "sonner";
import type { RenovationPhoto } from "./types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowUpDown, FolderOpen } from "lucide-react";

interface PhotoManagerProps {
  projectId: string;
  photos: MiniProjectPhoto[];
  onPhotosChange: (photos: MiniProjectPhoto[]) => void;
}

type UploadTab = "sync" | "upload";

export function PhotoManager({
  projectId,
  photos,
  onPhotosChange,
}: PhotoManagerProps) {
  const [activeTab, setActiveTab] = useState<UploadTab>("sync");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [sourcePhotos, setSourcePhotos] = useState<RenovationPhoto[]>([]);
  const [sourcePhotosLoading, setSourcePhotosLoading] = useState(false);

  const syncedPhotos = photos.filter((p) => !!p.origin_photo_id);
  const uploadedPhotos = photos.filter((p) => !p.origin_photo_id);
  const existingPhotoIds = new Set<string>(
    syncedPhotos.map((p) => p.origin_photo_id).filter(Boolean) as string[],
  );

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm("确定删除这张照片吗？")) return;
    try {
      const result = await deleteMiniPhotoAction(photoId);
      if (result.success) {
        onPhotosChange(photos.filter((p) => p.id !== photoId));
        toast.success("照片已删除");
      } else {
        toast.error(result.error || "删除照片失败");
      }
    } catch {
      toast.error("删除照片失败");
    }
  };

  const handleResetOrder = () => {
    const reordered = [...photos].sort((a, b) => {
      const aStage = a.renovation_stage || "";
      const bStage = b.renovation_stage || "";
      if (aStage !== bStage) return aStage.localeCompare(bStage);
      return (a.id || "").localeCompare(b.id || "");
    });
    onPhotosChange(reordered);
    toast.success("排序已重置");
  };

  const handlePhotosAdded = (
    addedPhotos: MiniProjectPhoto[],
    originToNewId: Record<string, string>,
  ) => {
    const existingIds = new Set(
      photos.map((p) => p.origin_photo_id).filter(Boolean),
    );
    const newPhotos = addedPhotos
      .filter((p) => !existingIds.has(p.origin_photo_id || p.id))
      .map((photo) => {
        const originId = photo.origin_photo_id || photo.id;
        return {
          id: originToNewId[originId] || photo.id,
          mini_project_id: projectId,
          origin_photo_id: originId,
          image_url: photo.image_url || photo.final_url || "",
          renovation_stage: photo.renovation_stage || "other",
          description: photo.description || null,
          sort_order: photos.length,
          created_at: photo.created_at || new Date().toISOString(),
          final_url: photo.final_url || null,
        };
      });
    onPhotosChange([...photos, ...newPhotos]);
  };

  const loadSourcePhotos = async () => {
    setSourcePhotosLoading(true);
    try {
      const result = await getSourcePhotosAction(projectId);
      if (result.success && result.data) {
        setSourcePhotos(result.data as RenovationPhoto[]);
      } else if (result.error) {
        toast.error(result.error || "加载照片失败");
      }
    } catch {
      toast.error("加载照片失败");
    } finally {
      setSourcePhotosLoading(false);
    }
  };

  const loadSourcePhotosRef = useRef(loadSourcePhotos);

  useEffect(() => {
    if (pickerOpen && sourcePhotos.length === 0) {
      loadSourcePhotosRef.current();
    }
  }, [pickerOpen, sourcePhotos.length]);

  return (
    <>
      <Card className="py-0 gap-0">
        <CardHeader className="border-b py-4">
          <div className="flex items-center justify-between gap-3">
            <CardTitle className="text-sm">照片管理</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResetOrder}
            >
              <ArrowUpDown />
              重置排序
            </Button>
          </div>
        </CardHeader>
        <CardContent className="py-6 space-y-4">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as UploadTab)}
          >
            <TabsList>
              <TabsTrigger value="sync">同步照片</TabsTrigger>
              <TabsTrigger value="upload">手动上传</TabsTrigger>
            </TabsList>

            <TabsContent value="sync" className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-medium text-muted-foreground">
                  项目库资源（{syncedPhotos.length}）
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                >
                  <FolderOpen />
                  从项目库选择
                </Button>
              </div>
              <div className="space-y-3">
                {syncedPhotos.map((photo, index) => (
                  <PhotoItem
                    key={photo.id}
                    photo={photo}
                    index={index}
                    onDelete={handleDeletePhoto}
                    isSynced={true}
                  />
                ))}
              </div>
            </TabsContent>

            <TabsContent value="upload" className="space-y-3">
              <div className="text-xs font-medium text-muted-foreground">
                手动上传资源（{uploadedPhotos.length}）
              </div>
              <div className="space-y-3">
                {uploadedPhotos.map((photo, index) => (
                  <PhotoItem
                    key={photo.id}
                    photo={photo}
                    index={index}
                    onDelete={handleDeletePhoto}
                    isSynced={false}
                  />
                ))}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <PhotoLibraryPicker
        projectId={projectId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onPhotosAdded={handlePhotosAdded}
        existingPhotoIds={existingPhotoIds}
        photos={sourcePhotos}
        loading={sourcePhotosLoading}
        onLoadPhotos={loadSourcePhotos}
      />
    </>
  );
}
