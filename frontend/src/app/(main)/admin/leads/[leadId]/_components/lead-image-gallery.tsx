"use client";

import { useRef, useState } from "react";

interface LeadImageGalleryProps {
  images: string[];
  onImageClick: (index: number) => void;
}

export function LeadImageGallery({ images, onImageClick }: LeadImageGalleryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (images.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/40 py-12 text-center text-sm text-muted-foreground">
        暂无图片
      </div>
    );
  }

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const { scrollLeft, scrollWidth } = target;
    const next = Math.round((scrollLeft / scrollWidth) * images.length);
    if (next !== activeIndex) {
      setActiveIndex(next);
    }
  };

  return (
    <div className="relative">
      {/* 移动端横向滑动画廊 */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory gap-2 -mx-3 px-3 sm:hidden"
      >
        {images.map((src, i) => (
          <button
            key={`${src}-${i}`}
            type="button"
            onClick={() => onImageClick(i)}
            className="w-[80vw] shrink-0 snap-start aspect-[4/3] rounded-xl bg-muted overflow-hidden"
            aria-label={`查看第 ${i + 1} 张图片`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>

      {/* 移动端索引指示器 */}
      <div className="mt-2 text-center text-xs text-muted-foreground tabular-nums sm:hidden">
        {activeIndex + 1}/{images.length}
      </div>

      {/* 桌面端 3 列网格 */}
      <div className="hidden sm:grid grid-cols-3 gap-2">
        {images.map((src, i) => (
          <button
            key={`${src}-${i}`}
            type="button"
            onClick={() => onImageClick(i)}
            className="aspect-[4/3] rounded-lg bg-muted overflow-hidden cursor-pointer"
            aria-label={`查看第 ${i + 1} 张图片`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-full w-full object-cover" />
          </button>
        ))}
      </div>
    </div>
  );
}
