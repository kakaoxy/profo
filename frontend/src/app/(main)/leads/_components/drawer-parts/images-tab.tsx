'use client';

import React from 'react';
import { ImageUpload } from '@/components/common/image-upload';
import type { ImageItem } from '@/components/common/image-upload';

interface Props {
  images: string[];
  onImagesChange?: (images: string[]) => void;
}

export const ImagesTab: React.FC<Props> = ({ images, onImagesChange }) => {
  const defaultValue: ImageItem[] = images.map((url, idx) => ({
    id: `existing-${idx}`,
    url,
    status: 'success' as const,
    progress: 100,
  }));

  const handleChange = (items: ImageItem[]) => {
    if (!onImagesChange) return;
    const urls = items
      .filter((i) => i.status === 'success' && (i.response?.url || i.url))
      .map((i) => i.response?.url || i.url);
    onImagesChange(urls);
  };

  return (
    <ImageUpload
      defaultValue={defaultValue}
      onChange={handleChange}
      maxCount={20}
      showUploadArea={!!onImagesChange}
      gridCols={2}
      aspectRatio="aspect-[4/3]"
      className="animate-in fade-in slide-in-from-bottom-4 duration-300"
    />
  );
};
