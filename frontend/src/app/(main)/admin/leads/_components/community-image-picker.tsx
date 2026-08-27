"use client";

/**
 * 小区户型图选择器 Dialog.
 *
 * 用于线索创建表单：选中小区后，从该小区的户型图库中选择户型图，
 * 追加到线索的 images 字段。已添加的 URL 灰显不可重复选择。
 *
 * 数据源解耦：通过 fetchImages prop 注入，admin 端和 C端各自传入
 * 调用不同后端端点的加载函数。
 */

import { useState, useEffect, useCallback } from "react";
import { Loader2, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { getThumbnailUrl } from "@/lib/config";

/** 简化的图片项（C端公开端点可能不返回完整字段，只需 url/thumbnail_url/description） */
export interface PickerImageItem {
  id: number | string;
  url: string;
  thumbnail_url?: string | null;
  description?: string | null;
}

interface CommunityImagePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 加载户型图列表的函数，Dialog 打开时调用 */
  fetchImages: () => Promise<PickerImageItem[]>;
  /** 已在表单 images 字段中的 URL 集合，灰显不可重复选 */
  existingUrls: Set<string>;
  /** 确认选择回调，传入选中的 URL 数组 */
  onSelect: (urls: string[]) => void;
}

export function CommunityImagePicker({
  open,
  onOpenChange,
  fetchImages,
  existingUrls,
  onSelect,
}: CommunityImagePickerProps) {
  const [images, setImages] = useState<PickerImageItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const loadImages = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchImages();
      setImages(items);
    } catch {
      setImages([]);
    }
    setLoading(false);
  }, [fetchImages]);

  useEffect(() => {
    if (open) {
      setSelected(new Set());
      void loadImages();
    }
  }, [open, loadImages]);

  const toggleSelect = (url: string) => {
    if (existingUrls.has(url)) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url);
      else next.add(url);
      return next;
    });
  };

  const handleConfirm = () => {
    onSelect(Array.from(selected));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-none max-w-[95vw] w-[600px] h-[75vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 border-b shrink-0">
          <DialogTitle>从小区户型图库选择</DialogTitle>
        </DialogHeader>

        {/* 图片网格 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              <span className="text-sm">加载中...</span>
            </div>
          ) : images.length === 0 ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              该小区暂无户型图
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {images.map((img) => {
                const isExisting = existingUrls.has(img.url);
                const isSelected = selected.has(img.url);
                return (
                  <button
                    key={img.id}
                    onClick={() => toggleSelect(img.url)}
                    disabled={isExisting}
                    className={`relative aspect-[4/3] rounded-lg overflow-hidden border-2 transition-all ${
                      isSelected
                        ? "border-ink ring-2 ring-ink/30"
                        : isExisting
                          ? "border-transparent opacity-30 cursor-not-allowed"
                          : "border-transparent hover:border-ink/40"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={getThumbnailUrl(img.thumbnail_url, img.url)}
                      alt={img.description ?? "户型图"}
                      className="h-full w-full object-cover"
                    />
                    {/* 选中标记 */}
                    {isSelected && (
                      <div className="absolute top-1 right-1 rounded-full bg-ink p-0.5">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                    {/* 已添加标记 */}
                    {isExisting && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                        <span className="text-[10px] text-white">已添加</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部 */}
        <DialogFooter className="p-4 border-t shrink-0">
          <div className="flex items-center justify-between w-full">
            <span className="text-sm text-muted-foreground">已选 {selected.size} 张</span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                取消
              </Button>
              <Button onClick={handleConfirm} disabled={selected.size === 0}>
                确认选择
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
