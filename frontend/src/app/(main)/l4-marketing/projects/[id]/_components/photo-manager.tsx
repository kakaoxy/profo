"use client";

import { useState, useEffect } from "react";
import { L4MarketingMedia } from "../../types";
import { PhotoItem } from "./photo-item";
import { PhotoLibraryPicker } from "./photo-library-picker";
import {
  createL4MarketingMediaAction,
  deleteL4MarketingMediaAction,
} from "../../actions";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowUpDown, FolderOpen, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PhotoManagerProps {
  projectId: number;
  photos: L4MarketingMedia[];
  onPhotosChange: (photos: L4MarketingMedia[]) => void;
}

type UploadTab = "sync" | "upload";

export function PhotoManager({
  projectId,
  photos,
  onPhotosChange,
}: PhotoManagerProps) {
  const [activeTab, setActiveTab] = useState<UploadTab>("upload");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploadUrl, setUploadUrl] = useState("");
  const [uploadStage, setUploadStage] = useState("other");
  const [uploadSortOrder, setUploadSortOrder] = useState(photos.length);
  const [uploading, setUploading] = useState(false);

  const handleDeletePhoto = async (photoId: number) => {
    if (!confirm("确定删除这张照片吗？")) return;
    try {
      const result = await deleteL4MarketingMediaAction(photoId);
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
      return (a.id || 0) - (b.id || 0);
    });
    onPhotosChange(reordered);
    toast.success("排序已重置");
  };

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
      const result = await createL4MarketingMediaAction(
        projectId,
        {
          file_url: trimmed,
          media_type: "image",
          renovation_stage: uploadStage,
          sort_order: uploadSortOrder,
        },
      );
      if (result.success && result.data) {
        onPhotosChange([...photos, result.data as L4MarketingMedia]);
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
            {photos.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetOrder}
              >
                <ArrowUpDown className="h-4 w-4 mr-1" />
                重置排序
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="py-6 space-y-4">
          <Tabs
            value={activeTab}
            onValueChange={(v) => setActiveTab(v as UploadTab)}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload">手动上传</TabsTrigger>
              <TabsTrigger value="sync">同步照片</TabsTrigger>
            </TabsList>

            <TabsContent value="upload" className="space-y-4 mt-4">
              <div className="text-xs font-medium text-muted-foreground">
                手动上传资源（{photos.length}）
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
                      <SelectItem value="拆除">拆除</SelectItem>
                      <SelectItem value="水电">水电</SelectItem>
                      <SelectItem value="木瓦">木瓦</SelectItem>
                      <SelectItem value="油漆">油漆</SelectItem>
                      <SelectItem value="安装">安装</SelectItem>
                      <SelectItem value="交付">交付</SelectItem>
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
                    <Upload className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-3">
                {photos.map((photo, index) => (
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

            <TabsContent value="sync" className="space-y-4 mt-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-medium text-muted-foreground">
                  从其他项目同步照片
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPickerOpen(true)}
                >
                  <FolderOpen className="h-4 w-4 mr-1" />
                  从照片库选择
                </Button>
              </div>
              <div className="text-sm text-slate-500 text-center py-8">
                点击上方按钮从照片库中选择照片进行同步
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
        onPhotosAdded={(addedPhotos) => {
          onPhotosChange([...photos, ...addedPhotos]);
        }}
        existingPhotoIds={new Set(photos.map((p) => p.id))}
      />
    </>
  );
}
