"use client";

/**
 * 小区户型图库管理页面.
 *
 * 复用 CommunitySelect 组件作为小区搜索框，选中小区后加载户型图网格。
 * 支持上传（property:write）、编辑描述、软删除、大图预览。
 */

import { useState, useCallback } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CommunitySelect, type Community } from "@/components/common/community-select";
import { usePermission } from "@/hooks/use-permission";
import { PERMISSION_CODES } from "@/lib/auth/permissions";
import type { components } from "@/lib/api-types";

import { ImageGrid } from "./_components/image-grid";
import { ImageUploadDialog } from "./_components/image-upload-dialog";
import { ImagePreviewDialog } from "./_components/image-preview-dialog";
import {
  listCommunityImagesAction,
  deleteCommunityImageAction,
  updateCommunityImageAction,
} from "./actions/upload-image";

type CommunityImageResponse = components["schemas"]["CommunityImageResponse"];

const PAGE_SIZE = 20;

export default function CommunityImagesPage() {
  const [selectedCommunity, setSelectedCommunity] = useState<Community | null>(null);
  const [images, setImages] = useState<CommunityImageResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { hasPermission } = usePermission();
  const canWrite = hasPermission(PERMISSION_CODES.PROPERTY_WRITE);

  const loadImages = useCallback(
    async (communityId: string, pageNum: number, append: boolean) => {
      if (pageNum === 1) setLoading(true);
      else setLoadingMore(true);

      const res = await listCommunityImagesAction(communityId, pageNum, PAGE_SIZE);
      if (res.success) {
        setImages((prev) => (append ? [...prev, ...res.data.items] : res.data.items));
        setTotal(res.data.total);
        setPage(pageNum);
      } else {
        toast.error(res.message);
      }

      if (pageNum === 1) setLoading(false);
      else setLoadingMore(false);
    },
    [],
  );

  const handleCommunityChange = (community: Community) => {
    if (!community.id) {
      toast.error("请从搜索结果中选择已有小区");
      return;
    }
    setSelectedCommunity(community);
    void loadImages(community.id, 1, false);
  };

  const handleUploadSuccess = () => {
    if (selectedCommunity) void loadImages(selectedCommunity.id, 1, false);
  };

  const handleDelete = async (imageId: number) => {
    const res = await deleteCommunityImageAction(imageId);
    if (res.success) {
      setImages((prev) => prev.filter((img) => img.id !== imageId));
      setTotal((prev) => prev - 1);
      toast.success("删除成功");
    } else {
      toast.error(res.message);
    }
  };

  const handleEdit = async (
    imageId: number,
    description: string,
  ): Promise<boolean> => {
    const res = await updateCommunityImageAction(imageId, { description });
    if (res.success) {
      setImages((prev) =>
        prev.map((img) => (img.id === imageId ? res.data : img)),
      );
      toast.success("更新成功");
      return true;
    }
    toast.error(res.message);
    return false;
  };

  const handleImageClick = (index: number) => {
    setPreviewIndex(index);
    setPreviewOpen(true);
  };

  const loadMore = () => {
    if (selectedCommunity) void loadImages(selectedCommunity.id, page + 1, true);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)]">
      {/* Header */}
      <header className="shrink-0 border-b border-border px-4 py-3">
        <h1 className="text-base font-bold mb-3">小区户型图库</h1>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <CommunitySelect
              value={selectedCommunity?.name ?? ""}
              onChange={handleCommunityChange}
              allowCreate={false}
              placeholder="搜索小区名称或商圈..."
              label="选择小区"
            />
          </div>
          {canWrite && selectedCommunity && (
            <Button
              size="sm"
              onClick={() => setUploadOpen(true)}
              className="h-12 shrink-0"
            >
              <Plus className="h-4 w-4 mr-1" />
              上传户型图
            </Button>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {!selectedCommunity ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <span className="text-sm">请搜索并选择小区</span>
          </div>
        ) : (
          <div className="space-y-4">
            <ImageGrid
              images={images}
              canWrite={canWrite}
              loading={loading}
              onImageClick={handleImageClick}
              onDelete={handleDelete}
              onEdit={handleEdit}
            />
            {images.length < total && (
              <div className="flex justify-center pt-4">
                <Button
                  variant="outline"
                  onClick={loadMore}
                  disabled={loadingMore}
                >
                  {loadingMore
                    ? "加载中..."
                    : `加载更多 (剩余 ${total - images.length} 张)`}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
      {selectedCommunity && (
        <ImageUploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          communityId={selectedCommunity.id}
          onSuccess={handleUploadSuccess}
        />
      )}
      <ImagePreviewDialog
        images={images}
        index={previewIndex}
        open={previewOpen}
        onIndexChange={setPreviewIndex}
        onOpenChange={setPreviewOpen}
      />
    </div>
  );
}
