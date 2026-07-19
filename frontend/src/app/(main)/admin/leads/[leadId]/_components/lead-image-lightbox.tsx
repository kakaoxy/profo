"use client";

import { useEffect, useState } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface LeadImageLightboxProps {
  images: string[];
  initialIndex: number;
  onClose: () => void;
}

export function LeadImageLightbox({
  images,
  initialIndex,
  onClose,
}: LeadImageLightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  // 锁定背景滚动
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // 键盘事件：ESC 关闭、左右箭头切换
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowLeft") {
        setIndex((prev) => Math.max(0, prev - 1));
      } else if (e.key === "ArrowRight") {
        setIndex((prev) => Math.min(images.length - 1, prev + 1));
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [images.length, onClose]);

  const goPrev = () => setIndex((prev) => Math.max(0, prev - 1));
  const goNext = () =>
    setIndex((prev) => Math.min(images.length - 1, prev + 1));

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchStartX(e.touches[0]?.clientX ?? null);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX === null) return;
    const endX = e.changedTouches[0]?.clientX ?? touchStartX;
    const diff = endX - touchStartX;
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        goPrev();
      } else {
        goNext();
      }
    }
    setTouchStartX(null);
  };

  const isPrevDisabled = index === 0;
  const isNextDisabled = index === images.length - 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="图片预览"
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* 顶部：索引指示器 + 关闭按钮 */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-sm font-semibold text-white tabular-nums">
        {index + 1}/{images.length}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
        aria-label="关闭"
      >
        <X className="h-5 w-5" />
      </button>

      {/* 左右箭头 */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!isPrevDisabled) goPrev();
        }}
        disabled={isPrevDisabled}
        className={cn(
          "absolute left-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors",
          isPrevDisabled && "opacity-30 cursor-not-allowed hover:bg-white/10",
        )}
        aria-label="上一张"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (!isNextDisabled) goNext();
        }}
        disabled={isNextDisabled}
        className={cn(
          "absolute right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors",
          isNextDisabled && "opacity-30 cursor-not-allowed hover:bg-white/10",
        )}
        aria-label="下一张"
      >
        <ChevronRight className="h-6 w-6" />
      </button>

      {/* 图片本体：点击不关闭 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={images[index]}
        alt=""
        onClick={(e) => e.stopPropagation()}
        className="max-w-[90vw] max-h-[80vh] object-contain"
      />
    </div>
  );
}
