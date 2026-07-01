"use client";

import { useState, useCallback } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react";
import { getFileUrl } from "@/lib/config";
import { isValidUrl } from "@/lib/validators";

const isDev = process.env.NODE_ENV === "development";

interface ImageCarouselProps {
  images: string[];
}

export function ImageCarousel({ images }: ImageCarouselProps) {
  const [current, setCurrent] = useState(0);

  const prev = useCallback(
    () => setCurrent((c) => (c > 0 ? c - 1 : images.length - 1)),
    [images.length]
  );
  const next = useCallback(
    () => setCurrent((c) => (c < images.length - 1 ? c + 1 : 0)),
    [images.length]
  );

  // Keyboard navigation support
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    },
    [prev, next]
  );

  if (!images || images.length === 0) {
    return (
      <div className="relative w-full aspect-video bg-fog rounded-cards">
        <div className="flex items-center justify-center h-full text-graphite text-sm">
          暂无图片
        </div>
      </div>
    );
  }

  const imgUrl = getFileUrl(images[current]);

  return (
    <div
      className="relative w-full aspect-video bg-fog rounded-cards overflow-hidden focus-within:ring-2 focus-within:ring-ink/20"
      onKeyDown={handleKeyDown}
      role="region"
      aria-roledescription="carousel"
      aria-label="房源图片轮播"
    >
      {isValidUrl(imgUrl) ? (
        isDev ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgUrl}
            alt={`图片 ${current + 1}`}
            width={1200}
            height={675}
            className="w-full h-full object-cover"
          />
        ) : (
          <Image
            src={imgUrl}
            alt={`图片 ${current + 1}`}
            fill
            className="object-cover"
            sizes="100vw"
            priority
          />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon className="h-8 w-8 text-graphite" aria-hidden="true" />
        </div>
      )}

      {images.length > 1 && (
        <>
          <button
            onClick={prev}
            aria-label="上一张图片"
            className="absolute left-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-ink/30 backdrop-blur-sm text-white hover:bg-ink/50 focus-visible:ring-2 focus-visible:ring-white/50 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={next}
            aria-label="下一张图片"
            className="absolute right-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-ink/30 backdrop-blur-sm text-white hover:bg-ink/50 focus-visible:ring-2 focus-visible:ring-white/50 transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      {/* Animated counter with aria-live for screen readers */}
      <span
        className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm text-white text-xs font-medium tabular-nums"
        aria-live="polite"
        aria-atomic="true"
      >
        {current + 1}&nbsp;/&nbsp;{images.length}
      </span>
    </div>
  );
}
