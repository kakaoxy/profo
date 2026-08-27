"use client";

import React, { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Plus, ChevronLeft, ChevronRight, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUpload, DEFAULT_ALLOWED_IMAGE_TYPES } from "@/components/common/upload";
import { toast } from "sonner";

interface ImagesStripProps {
  images: string[];
  onImagesChange?: (images: string[]) => void;
}

const MAX_COUNT = 6;

export const ImagesStrip: React.FC<ImagesStripProps> = ({ images, onImagesChange }) => {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canAdd = !!onImagesChange && images.length < MAX_COUNT;

  // 用 ref 跟踪最新 images，避免多文件并发上传时 onSuccess 闭包 stale 丢失 URL
  const imagesRef = useRef(images);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  const { upload, isUploading } = useUpload({
    allowedTypes: DEFAULT_ALLOWED_IMAGE_TYPES,
    maxCount: MAX_COUNT,
    onSuccess: (response, file) => {
      if (response.url) {
        const next = [...imagesRef.current, response.url];
        imagesRef.current = next;
        onImagesChange?.(next);
        toast.success(`${file.name} 上传成功`);
      }
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remainingSlots = MAX_COUNT - images.length;
    if (remainingSlots <= 0) {
      toast.error(`最多只能上传 ${MAX_COUNT} 张图片`);
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    if (filesToUpload.length > 0) {
      await upload(filesToUpload);
    }
    // 清空 input 以允许重复上传同一文件
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <section className="bg-pure-white rounded-cards shadow-steep-sm overflow-hidden">
      {/* 头部 */}
      <div className="bg-fog px-4 py-2.5 border-b border-dove flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          <ImageIcon className="h-3 w-3 text-graphite shrink-0" />
          <span className="text-xs font-medium text-graphite">影像库</span>
          <span className="text-dove">·</span>
          <span className="text-xs text-graphite truncate">户型图 / 实勘 / 产证</span>
        </div>
        <span className="text-xs text-graphite font-medium shrink-0 ml-2">
          {images.length} / {MAX_COUNT}
        </span>
      </div>

      {/* 主体：横向缩略图条 */}
      <div className="p-4">
        <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
          {images.map((url, idx) => (
            <div
              key={`${idx}-${url}`}
              className="shrink-0 w-24 h-24 rounded-[12px] overflow-hidden border border-dove cursor-pointer hover:border-ink transition-colors"
              onClick={() => setSelectedIdx(idx)}
              title={`图片 ${idx + 1}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`图片 ${idx + 1}`}
                className="w-full h-full object-cover rounded-[12px]"
                loading="lazy"
              />
            </div>
          ))}

          {/* 添加按钮：仅当父组件传入 onImagesChange 时可点击 */}
          {canAdd && (
            <button
              type="button"
              disabled={isUploading}
              onClick={() => !isUploading && fileInputRef.current?.click()}
              className={cn(
                "shrink-0 w-24 h-24 rounded-[12px] border-2 border-dashed border-dove hover:border-ink flex flex-col items-center justify-center gap-1 text-graphite",
                isUploading && "opacity-50 cursor-not-allowed hover:border-dove",
              )}
              title={isUploading ? "上传中..." : "上传新图片"}
            >
              {isUploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  <span className="text-[10px] font-medium">添加</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* 隐藏的文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept={DEFAULT_ALLOWED_IMAGE_TYPES.join(",")}
        multiple
        className="hidden"
        onChange={handleFileChange}
        disabled={isUploading}
      />

      {/* Lightbox */}
      {selectedIdx != null && images.length > 0 && (
        <ImageLightbox
          images={images}
          startIndex={selectedIdx}
          onClose={() => setSelectedIdx(null)}
        />
      )}
    </section>
  );
};

interface ImageLightboxProps {
  images: string[];
  startIndex: number;
  onClose: () => void;
}

const ImageLightbox: React.FC<ImageLightboxProps> = ({ images, startIndex, onClose }) => {
  const [idx, setIdx] = useState(startIndex);
  const total = images.length;

  const go = React.useCallback(
    (delta: number) => {
      setIdx((i) => (i + delta + total) % total);
    },
    [total],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [go, onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/85 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      {/* 关闭按钮 */}
      <button
        type="button"
        className="absolute top-6 right-6 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
        onClick={onClose}
        aria-label="关闭"
      >
        <X className="h-5 w-5" />
      </button>

      {/* 上一张 */}
      {total > 1 && (
        <button
          type="button"
          className="absolute left-6 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            go(-1);
          }}
          aria-label="上一张"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}

      {/* 图片 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={images[idx]}
        alt={`图片 ${idx + 1}`}
        className="max-w-[80vw] max-h-[80vh] rounded-[12px] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      {/* 下一张 */}
      {total > 1 && (
        <button
          type="button"
          className="absolute right-6 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            go(1);
          }}
          aria-label="下一张"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )}

      {/* 分页指示器 */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/90 px-3 py-1 rounded-full text-xs font-bold text-foreground">
        {idx + 1} / {total}
      </div>
    </div>
  );
};
