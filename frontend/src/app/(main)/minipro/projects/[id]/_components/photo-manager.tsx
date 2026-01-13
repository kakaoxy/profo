'use client';

import { useState } from 'react';
import { MiniProjectPhoto } from '../../types';
import { PhotoItem } from './photo-item';
import { UploadZone } from './upload-zone';
import { addMiniPhotoAction, deleteMiniPhotoAction } from '../../actions';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PhotoManagerProps {
  projectId: string;
  photos: MiniProjectPhoto[];
  onPhotosChange: (photos: MiniProjectPhoto[]) => void;
}

type UploadTab = 'sync' | 'upload';

export function PhotoManager({ projectId, photos, onPhotosChange }: PhotoManagerProps) {
  const [activeTab, setActiveTab] = useState<UploadTab>('sync');

  const syncedPhotos = photos.filter((p) => !!p.origin_photo_id);
  const uploadedPhotos = photos.filter((p) => !p.origin_photo_id);

  const handleDeletePhoto = async (photoId: string) => {
    if (!confirm('确定删除这张照片吗？')) return;
    try {
      const result = await deleteMiniPhotoAction(photoId);
      if (result.success) {
        onPhotosChange(photos.filter((p) => p.id !== photoId));
        toast.success('照片已删除');
      } else {
        toast.error(result.error || '删除照片失败');
      }
    } catch {
      toast.error('删除照片失败');
    }
  };

  const handleUpload = async (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const url = URL.createObjectURL(file);
      
      try {
        const result = await addMiniPhotoAction(projectId, url, 'other');
        if (result.success && result.data) {
          onPhotosChange([...photos, result.data as MiniProjectPhoto]);
        } else {
          toast.error(result.error || '上传失败');
        }
      } catch {
        toast.error('上传失败');
      }
    }
    toast.success('照片上传成功');
  };

  const handleResetOrder = () => {
    const reordered = [...photos].sort((a, b) => {
      const aStage = a.renovation_stage || '';
      const bStage = b.renovation_stage || '';
      if (aStage !== bStage) return aStage.localeCompare(bStage);
      return (a.id || '').localeCompare(b.id || '');
    });
    onPhotosChange(reordered);
    toast.success('排序已重置');
  };

  return (
    <section className="bg-white rounded-lg border border-border-gray card-shadow overflow-hidden">
      <div className="flex">
        <div className="w-1.5 bg-accent-red" />
        <div className="flex-1 px-6 py-4 border-b border-gray-50 flex items-center justify-between">
          <h2 className="font-bold text-base text-text-main">照片管理 (album)</h2>
          <button
            className="text-primary text-[11px] font-bold hover:underline outline-none"
            onClick={handleResetOrder}
          >
            重置排序
          </button>
        </div>
      </div>
      <div className="flex border-b border-gray-100 px-6">
        <button
          className={cn(
            'px-6 py-3 text-sm font-bold transition-colors outline-none',
            activeTab === 'sync'
              ? 'text-primary border-b-2 border-primary'
              : 'text-text-secondary hover:text-text-main'
          )}
          onClick={() => setActiveTab('sync')}
        >
          同步照片
        </button>
        <button
          className={cn(
            'px-6 py-3 text-sm font-bold transition-colors outline-none',
            activeTab === 'upload'
              ? 'text-primary border-b-2 border-primary'
              : 'text-text-secondary hover:text-text-main'
          )}
          onClick={() => setActiveTab('upload')}
        >
          手动上传
        </button>
      </div>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">
            项目库资源 ({syncedPhotos.length})
          </span>
          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/5 text-primary rounded text-xs font-bold border border-primary/20 hover:bg-primary/10 transition-colors outline-none">
            从项目库选择
          </button>
        </div>
        <div className="space-y-3">
          {syncedPhotos.map((photo, index) => (
            <PhotoItem
              key={photo.id}
              photo={photo}
              index={index}
              onDelete={handleDeletePhoto}
              isSynced={true}
            />
          ))}
        </div>
        <div className="pt-6 border-t border-gray-100">
          <span className="text-[11px] font-bold text-text-secondary uppercase tracking-wider block mb-4">
            手动上传资源 ({uploadedPhotos.length})
          </span>
          <div className="space-y-3">
            {uploadedPhotos.map((photo, index) => (
              <PhotoItem
                key={photo.id}
                photo={photo}
                index={index}
                onDelete={handleDeletePhoto}
                isSynced={false}
              />
            ))}
            <UploadZone onUpload={handleUpload} />
          </div>
        </div>
      </div>
    </section>
  );
}
