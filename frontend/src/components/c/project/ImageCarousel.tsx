"use client";

import { useState } from "react";
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

  if (!images || images.length === 0) {
    return (
      <div className="relative w-full aspect-video bg-gray-100">
        <div className="flex items-center justify-center h-full text-c-text-secondary text-sm">
          暂无图片
        </div>
      </div>
    );
  }

  const prev = () => setCurrent((c) => (c > 0 ? c - 1 : images.length - 1));
  const next = () => setCurrent((c) => (c < images.length - 1 ? c + 1 : 0));

  return (
    <div className="relative w-full aspect-video bg-gray-100 overflow-hidden">
      {isValidUrl(getFileUrl(images[current])) ? (
        isDev ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={getFileUrl(images[current])}
            alt={`图片 ${current + 1}`}
            className="w-full h-full object-cover"
          />
        ) : (
          <Image
            src={getFileUrl(images[current])}
            alt={`图片 ${current + 1}`}
            fill
            className="object-cover"
            sizes="100vw"
            priority
          />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon className="h-8 w-8 text-c-text-secondary" />
        </div>
      )}

      {images.length > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm text-white hover:bg-black/50 transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            onClick={next}
            className="absolute right-3 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-black/30 backdrop-blur-sm text-white hover:bg-black/50 transition-colors"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </>
      )}

      <span className="absolute bottom-3 right-3 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm text-white text-xs font-medium">
        {current + 1}/{images.length}
      </span>
    </div>
  );
}
