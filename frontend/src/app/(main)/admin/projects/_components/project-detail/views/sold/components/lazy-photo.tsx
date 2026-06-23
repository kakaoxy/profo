"use client";

import { useState, useCallback, memo } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { ImageIcon } from "lucide-react";
import { isValidUrl } from "@/lib/validators";
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
    <div ref={ref} className="absolute inset-0 bg-card animate-pulse" />
  );
});

export const LazyPhoto = memo(function LazyPhoto({ photo }: LazyPhotoProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className="relative aspect-video rounded-lg overflow-hidden bg-card">
      {isVisible ? (
        isValidUrl(getFileUrl(photo.url)) ? (
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
          <div className="w-full h-full bg-muted flex items-center justify-center">
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          </div>
        )
      ) : (
        <LazyPhotoPlaceholder onVisible={() => setIsVisible(true)} />
      )}
      {!isLoaded && isVisible && isValidUrl(getFileUrl(photo.url)) && (
        <div className="absolute inset-0 bg-muted animate-pulse" />
      )}
    </div>
  );
});
