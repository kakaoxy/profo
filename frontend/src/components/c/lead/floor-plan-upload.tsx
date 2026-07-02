"use client";

import { useRef, useCallback } from "react";
import Image from "next/image";
import { X, Plus, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { useUpload } from "@/components/common/upload";
import { getClientApiUrl, apiPaths } from "@/lib/config";
import { cLocale } from "@/lib/i18n/c-locale";

interface Props {
  images: string[];
  onChange: (images: string[] | ((prev: string[]) => string[])) => void;
  maxImages?: number;
  maxFileSize?: number; // MB
}

/** 本地开发环境 URL 需关闭 next/image 优化，避免私有 IP 限制 */
const isLocalDevUrl = (url: string): boolean =>
  url.includes("127.0.0.1") || url.includes("localhost");

// 与 backend/routers/public/files.py 的 IMAGE_EXTENSIONS 保持一致：仅 jpg/jpeg/png
const FLOOR_PLAN_ALLOWED_TYPES = ["image/jpeg", "image/png"];
const FLOOR_PLAN_ACCEPT = ".jpg,.jpeg,.png";

export function FloorPlanUpload({
  images,
  onChange,
  maxImages = 6,
  maxFileSize = 10,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { isUploading, upload, uploadingFiles } = useUpload({
    url: getClientApiUrl(apiPaths.cFiles.upload),
    maxSize: maxFileSize * 1024 * 1024,
    allowedTypes: FLOOR_PLAN_ALLOWED_TYPES,
    multiple: true,
    onSuccess: (response) => {
      if (response.url) {
        onChange((prev) => [...prev, response.url]);
      }
    },
    onError: (error) => {
      toast.error(cLocale.valuation.floorPlanUploadFailed, {
        description: error.message,
      });
    },
  });

  const totalProgress =
    uploadingFiles.length > 0
      ? Math.round(uploadingFiles.reduce((sum, f) => sum + f.progress, 0) / uploadingFiles.length)
      : 0;

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const remaining = maxImages - images.length;
    if (remaining <= 0) {
      toast.error(cLocale.valuation.floorPlanMaxImages(maxImages));
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remaining);
    if (filesToUpload.length > 0) {
      await upload(filesToUpload);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = useCallback(
    (index: number) => {
      onChange((prev) => prev.filter((_, i) => i !== index));
    },
    [onChange]
  );

  const canAddMore = images.length < maxImages;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] sm:text-xs font-medium text-graphite uppercase tracking-widest ml-1">
          {cLocale.valuation.floorPlanLabel}
        </span>
        <span className="text-[10px] text-graphite">
          {images.length}/{maxImages}
        </span>
      </div>
      <p className="text-[11px] text-graphite/80 ml-1">
        {cLocale.valuation.floorPlanHint.replace("{max}", String(maxImages))}
      </p>

      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
        {images.map((img, idx) => (
          <div
            key={`${img}-${idx}`}
            className="aspect-square relative rounded-inputs overflow-hidden border border-dove/30 bg-white group"
          >
            <Image
              src={img}
              alt={`${cLocale.valuation.floorPlanLabel} ${idx + 1}`}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105"
              sizes="(max-width: 640px) 33vw, 25vw"
              unoptimized={isLocalDevUrl(img)}
              priority={idx === 0}
            />
            <button
              type="button"
              onClick={() => removeImage(idx)}
              className="absolute top-1 right-1 h-6 w-6 bg-ink/60 text-white rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-ink/80"
              aria-label={`${cLocale.valuation.floorPlanLabel} ${idx + 1}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}

        {canAddMore && (
          <button
            type="button"
            onClick={() => !isUploading && fileInputRef.current?.click()}
            disabled={isUploading}
            className="aspect-square border-2 border-dashed border-dove/40 rounded-inputs flex flex-col items-center justify-center text-graphite hover:text-rust hover:border-rust/40 transition-all bg-fog/50 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label={cLocale.valuation.floorPlanLabel}
          >
            {isUploading ? (
              <div className="flex flex-col items-center gap-1">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-[8px] font-black uppercase tracking-widest">
                  {totalProgress}%
                </span>
              </div>
            ) : (
              <>
                <Plus className="h-5 w-5 mb-0.5" />
                <span className="text-[8px] font-black uppercase tracking-widest">
                  {cLocale.valuation.floorPlanAddPic}
                </span>
              </>
            )}
          </button>
        )}

        {!canAddMore && images.length >= maxImages && (
          <div className="aspect-square border-2 border-dashed border-dove/40 rounded-inputs flex flex-col items-center justify-center text-graphite bg-fog/30">
            <AlertCircle className="h-4 w-4 mb-1" />
            <span className="text-[8px] font-black uppercase tracking-widest">
              {cLocale.valuation.floorPlanFull}
            </span>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={FLOOR_PLAN_ACCEPT}
        multiple
        className="hidden"
        onChange={handleSelect}
        disabled={isUploading}
      />
    </div>
  );
}
