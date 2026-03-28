"use client";

import Image from "next/image";
import { getFileUrl } from "@/lib/config";
import { useState } from "react";

interface HeroGalleryProps {
  mainImage?: string;
  secondaryImages: string[];
  totalCount: number;
  projectStatus: string;
}

// 图片占位符组件
function ImagePlaceholder({ size = "large" }: { size?: "large" | "small" }) {
  const dimensions = size === "large" ? { width: 64, height: 64 } : { width: 48, height: 48 };
  return (
    <div className="w-full h-full bg-gradient-to-br from-[#005daa]/10 to-[#0075d5]/10 flex items-center justify-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={dimensions.width}
        height={dimensions.height}
        viewBox="0 0 24 24"
        fill="none"
        stroke="#005daa"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="opacity-30"
      >
        <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
        <circle cx="9" cy="9" r="2" />
        <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
      </svg>
    </div>
  );
}

// 次要图片占位符组件
function SecondaryImagePlaceholder() {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#eff4ff] to-[#dce9ff]">
      <div className="absolute inset-0 flex items-center justify-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#707785"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="opacity-30"
        >
          <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
        </svg>
      </div>
    </div>
  );
}

export function HeroGallery({
  mainImage,
  secondaryImages,
  totalCount,
  projectStatus,
}: HeroGalleryProps) {
  const statusText =
    projectStatus === "在售"
      ? "在售中"
      : projectStatus === "已售"
        ? "已成交"
        : "在途中";

  // 追踪图片加载错误状态
  const [mainImageError, setMainImageError] = useState(false);
  const [secondaryImageErrors, setSecondaryImageErrors] = useState<boolean[]>([false, false]);

  const handleSecondaryImageError = (index: number) => {
    setSecondaryImageErrors(prev => {
      const newErrors = [...prev];
      newErrors[index] = true;
      return newErrors;
    });
  };

  return (
    <section className="mt-4 grid grid-cols-12 gap-4 h-[500px]">
      <div className="col-span-12 lg:col-span-8 relative overflow-hidden rounded-2xl group">
        {mainImage && !mainImageError ? (
          <Image
            src={getFileUrl(mainImage)}
            alt="Primary view"
            fill
            sizes="(max-width: 1024px) 100vw, 66vw"
            priority
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            onError={() => setMainImageError(true)}
          />
        ) : (
          <ImagePlaceholder size="large" />
        )}
        <div className="absolute top-4 left-4">
          <span className="bg-[#9d6a00] text-white px-4 py-1.5 rounded-full text-sm font-bold shadow-lg">
            {statusText}
          </span>
        </div>
      </div>
      <div className="col-span-12 lg:col-span-4 grid grid-rows-2 gap-4">
        {secondaryImages[0] && !secondaryImageErrors[0] ? (
          <div className="relative overflow-hidden rounded-2xl group">
            <Image
              src={getFileUrl(secondaryImages[0])}
              alt="Interior"
              fill
              sizes="(max-width: 1024px) 100vw, 33vw"
              className="object-cover transition-transform duration-700 group-hover:scale-105"
              onError={() => handleSecondaryImageError(0)}
            />
          </div>
        ) : (
          <SecondaryImagePlaceholder />
        )}
        {secondaryImages[1] && !secondaryImageErrors[1] ? (
          <div className="relative overflow-hidden rounded-2xl group">
            <Image
              src={getFileUrl(secondaryImages[1])}
              alt="Kitchen"
              fill
              sizes="(max-width: 1024px) 100vw, 33vw"
              className="object-cover transition-transform duration-700 group-hover:scale-105"
              onError={() => handleSecondaryImageError(1)}
            />
            {totalCount > 3 ? (
              <button className="absolute bottom-4 right-4 bg-white/90 backdrop-blur text-[#005daa] px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 shadow-sm hover:bg-white transition-colors">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="7" height="7" x="3" y="3" rx="1" />
                  <rect width="7" height="7" x="14" y="3" rx="1" />
                  <rect width="7" height="7" x="14" y="14" rx="1" />
                  <rect width="7" height="7" x="3" y="14" rx="1" />
                </svg>
                查看全部 {totalCount} 张照片
              </button>
            ) : null}
          </div>
        ) : (
          <SecondaryImagePlaceholder />
        )}
      </div>
    </section>
  );
}
