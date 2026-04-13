"use client";

import Image from "next/image";
import { getFileUrl } from "@/lib/config";
import { useRef, useState, useCallback } from "react";
import { Badge } from "@/components/ui/badge";

// 判断是否为开发环境
const isDev = process.env.NODE_ENV === "development";

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
    <div className="w-full h-full bg-slate-100 flex items-center justify-center">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={dimensions.width}
        height={dimensions.height}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-slate-300"
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
    <div className="relative overflow-hidden rounded-xl bg-slate-100">
      <div className="absolute inset-0 flex items-center justify-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-slate-300"
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

  const statusColor =
    projectStatus === "在售"
      ? "bg-emerald-500"
      : projectStatus === "已售"
        ? "bg-slate-400"
        : "bg-blue-500";

  // 使用 ref 追踪图片加载错误状态，避免触发重新渲染
  const mainImageErrorRef = useRef(false);
  const secondaryImageErrorsRef = useRef<boolean[]>([false, false]);
  const [renderKey, setRenderKey] = useState(0);

  const handleMainImageError = useCallback(() => {
    if (!mainImageErrorRef.current) {
      mainImageErrorRef.current = true;
      setRenderKey((k) => k + 1);
    }
  }, []);

  const handleSecondaryImageError = useCallback((index: number) => {
    if (!secondaryImageErrorsRef.current[index]) {
      secondaryImageErrorsRef.current[index] = true;
      setRenderKey((k) => k + 1);
    }
  }, []);

  // 检查是否应该显示占位符
  const shouldShowMainPlaceholder = !mainImage || mainImageErrorRef.current;
  const shouldShowSecondaryPlaceholder0 = !secondaryImages[0] || secondaryImageErrorsRef.current[0];
  const shouldShowSecondaryPlaceholder1 = !secondaryImages[1] || secondaryImageErrorsRef.current[1];

  return (
    <section className="mt-4 grid grid-cols-12 gap-4 h-[500px]" key={renderKey}>
      <div className="col-span-12 lg:col-span-8 relative overflow-hidden rounded-xl group">
        {!shouldShowMainPlaceholder ? (
          isDev ? (
            <img
              src={getFileUrl(mainImage!)}
              alt="Primary view"
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              onError={handleMainImageError}
            />
          ) : (
            <Image
              src={getFileUrl(mainImage!)}
              alt="Primary view"
              fill
              sizes="(max-width: 1024px) 100vw, 66vw"
              priority
              className="object-cover transition-transform duration-700 group-hover:scale-105"
              onError={handleMainImageError}
            />
          )
        ) : (
          <ImagePlaceholder size="large" />
        )}
        <div className="absolute top-4 left-4">
          <Badge className={`${statusColor} text-white px-3 py-1 text-sm font-medium`}>
            {statusText}
          </Badge>
        </div>
      </div>
      <div className="col-span-12 lg:col-span-4 grid grid-rows-2 gap-4">
        {!shouldShowSecondaryPlaceholder0 ? (
          <div className="relative overflow-hidden rounded-xl group">
            {isDev ? (
              <img
                src={getFileUrl(secondaryImages[0]!)}
                alt="Interior"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                onError={() => handleSecondaryImageError(0)}
              />
            ) : (
              <Image
                src={getFileUrl(secondaryImages[0]!)}
                alt="Interior"
                fill
                sizes="(max-width: 1024px) 100vw, 33vw"
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                onError={() => handleSecondaryImageError(0)}
              />
            )}
          </div>
        ) : (
          <SecondaryImagePlaceholder />
        )}
        {!shouldShowSecondaryPlaceholder1 ? (
          <div className="relative overflow-hidden rounded-xl group">
            {isDev ? (
              <img
                src={getFileUrl(secondaryImages[1]!)}
                alt="Kitchen"
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                onError={() => handleSecondaryImageError(1)}
              />
            ) : (
              <Image
                src={getFileUrl(secondaryImages[1]!)}
                alt="Kitchen"
                fill
                sizes="(max-width: 1024px) 100vw, 33vw"
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                onError={() => handleSecondaryImageError(1)}
              />
            )}
            {totalCount > 3 ? (
              <button className="absolute bottom-4 right-4 bg-white/90 backdrop-blur text-slate-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 shadow-sm hover:bg-white transition-colors">
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
