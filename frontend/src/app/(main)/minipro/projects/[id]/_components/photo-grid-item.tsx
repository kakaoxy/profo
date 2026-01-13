'use client';

import { cn } from '@/lib/utils';
import { getFileUrl } from '@/lib/config';
import { Check } from 'lucide-react';
import type { RenovationPhoto } from './types';

interface PhotoGridItemProps {
  photo: RenovationPhoto;
  isSelected: boolean;
  isExisting: boolean;
  onToggle: () => void;
}

export function PhotoGridItem({ photo, isSelected, isExisting, onToggle }: PhotoGridItemProps) {
  return (
    <div
      className={cn(
        'relative p-2 rounded-xl border-2 cursor-pointer transition-all',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border hover:border-primary/50',
        isExisting && 'opacity-50'
      )}
      onClick={() => !isExisting && onToggle()}
    >
      {isSelected && (
        <div className="absolute top-3 right-3 z-10 bg-primary text-white rounded-full p-0.5">
          <Check className="w-3 h-3" />
        </div>
      )}
      {!isSelected && !isExisting && (
        <div className="absolute top-3 right-3 z-10 w-5 h-5 border-2 border-border bg-white/80 rounded-full" />
      )}
      {isExisting && (
        <div className="absolute top-3 right-3 z-10 bg-green-500 text-white text-[8px] font-bold px-1.5 py-0.5 rounded">
          已添加
        </div>
      )}
      <div
        className="w-full aspect-square rounded-lg bg-cover bg-center mb-2"
        style={{ backgroundImage: `url(${getFileUrl(photo.url)})` }}
      />
      <div className="px-1">
        <p className="text-xs font-bold truncate">
          ID: {photo.id.slice(0, 8)}
        </p>
        <p className="text-[10px] text-muted-foreground truncate">
          {photo.description || photo.stage}
        </p>
      </div>
    </div>
  );
}
