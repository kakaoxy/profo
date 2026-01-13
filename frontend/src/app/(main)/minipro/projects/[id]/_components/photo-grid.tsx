'use client';

import { Loader2 } from 'lucide-react';
import { PhotoGridItem } from './photo-grid-item';
import type { RenovationPhoto } from './types';

interface PhotoGridProps {
  photos: RenovationPhoto[];
  loading: boolean;
  existingPhotoIds: Set<string>;
  selectedIds: Set<string>;
  onTogglePhoto: (photoId: string) => void;
}

export function PhotoGrid({ photos, loading, existingPhotoIds, selectedIds, onTogglePhoto }: PhotoGridProps) {
  if (loading) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (photos.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex items-center justify-center h-full text-muted-foreground">
          暂无照片
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {photos.map((photo) => (
          <PhotoGridItem
            key={photo.id}
            photo={photo}
            isSelected={selectedIds.has(photo.id)}
            isExisting={existingPhotoIds.has(photo.id)}
            onToggle={() => onTogglePhoto(photo.id)}
          />
        ))}
      </div>
    </div>
  );
}
