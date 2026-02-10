"use client";

import { useState, useEffect, useRef } from "react";
import { MiniProjectPhoto } from "../../types";
import { PhotoItem } from "./photo-item";
import { PhotoLibraryPicker } from "./photo-library-picker";
import {
  addMiniPhotoAction,
  deleteMiniPhotoAction,
  getSourcePhotosAction,
} from "../../actions";
import { toast } from "sonner";
import type { RenovationPhoto } from "./types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowUpDown, FolderOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  const [uploadUrl, setUploadUrl] = useState("");
  const [uploadStage, setUploadStage] = useState("other");
  const [uploadSortOrder, setUploadSortOrder] = useState(photos.length);
  const [uploading, setUploading] = useState(false);

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
          sort_order: photo.sort_order ?? photos.length,
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

  useEffect(() => {
    setUploadSortOrder(photos.length);
  }, [photos.length]);

  const handleAddUploadedPhoto = async () => {
    const trimmed = uploadUrl.trim();
    if (!trimmed) {
      toast.error("请输入图片 URL");
      return;
    }

    setUploading(true);
    try {
      const result = await addMiniPhotoAction(
        projectId,
        trimmed,
        uploadStage,
        undefined,
        uploadSortOrder,
      );
      if (result.success && result.data) {
        onPhotosChange([...photos, result.data as MiniProjectPhoto]);
        toast.success("照片已添加");
        setUploadUrl("");
      } else {
        toast.error(result.error || "添加照片失败");
      }
    } catch {
      toast.error("添加照片失败");
    } finally {
      setUploading(false);
    }
  };

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
              <div className="grid grid-cols-12 gap-3 rounded-md border bg-muted/20 p-3">
                <div className="col-span-12 lg:col-span-6">
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    图片 URL
                  </div>
                  <Input
                    value={uploadUrl}
                    onChange={(e) => setUploadUrl(e.target.value)}
                    placeholder="http(s):// 或 /path"
                  />
                </div>
                <div className="col-span-6 lg:col-span-3">
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    阶段
                  </div>
                  <Select value={uploadStage} onValueChange={setUploadStage}>
                    <SelectTrigger>
                      <SelectValue placeholder="选择阶段" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="signing">签约</SelectItem>
                      <SelectItem value="renovating">改造</SelectItem>
                      <SelectItem value="selling">销售</SelectItem>
                      <SelectItem value="sold">已售</SelectItem>
                      <SelectItem value="other">其他</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-6 lg:col-span-2">
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    排序
                  </div>
                  <Input
                    type="number"
                    value={uploadSortOrder}
                    onChange={(e) =>
                      setUploadSortOrder(Number(e.target.value || 0))
                    }
                    min={0}
                  />
                </div>
                <div className="col-span-12 lg:col-span-1 flex items-end">
                  <Button
                    type="button"
                    className="w-full"
                    disabled={uploading}
                    onClick={handleAddUploadedPhoto}
                  >
                    添加
                  </Button>
                </div>
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
        nextSortOrderStart={photos.length}
        onPhotosAdded={handlePhotosAdded}
        existingPhotoIds={existingPhotoIds}
        photos={sourcePhotos}
        loading={sourcePhotosLoading}
        onLoadPhotos={loadSourcePhotos}
      />
    </>
  );
}
