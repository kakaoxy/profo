"use client";

import { useState, useCallback, memo } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { RenovationPhoto } from "../../../../../types";
import { getFileUrl } from "../../../utils";

interface LazyPhotoProps {
  photo: RenovationPhoto;
  index: number;
}

interface LazyPhotoPlaceholderProps {
  onVisible: () => void;
}

const LazyPhotoPlaceholder = memo(function LazyPhotoPlaceholder({ onVisible }: LazyPhotoPlaceholderProps) {
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            onVisible();
            observer.disconnect();
          }
        });
      },
      { rootMargin: "100px" }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [onVisible]);

  return (
    <div ref={ref} className="absolute inset-0 bg-slate-800 animate-pulse" />
  );
});

export const LazyPhoto = memo(function LazyPhoto({ photo }: LazyPhotoProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className="relative aspect-video rounded-lg overflow-hidden bg-slate-800">
      {isVisible ? (
        <Image
          src={getFileUrl(photo.url)}
          alt={photo.description || photo.filename || "装修照片"}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          loading="lazy"
          unoptimized
          className={cn(
            "object-contain transition-opacity duration-300",
            isLoaded ? "opacity-100" : "opacity-0"
          )}
          onLoad={() => setIsLoaded(true)}
        />
      ) : (
        <LazyPhotoPlaceholder onVisible={() => setIsVisible(true)} />
      )}
      {!isLoaded && isVisible && (
        <div className="absolute inset-0 bg-slate-700 animate-pulse" />
      )}
    </div>
  );
});
