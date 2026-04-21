'use client';

import React, { useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import { Eye, Plus, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { uploadFileAction } from '@/app/(main)/projects/actions/files';

interface Props {
  images: string[];
  onImagesChange?: (images: string[]) => void;
}

const isLocalDevUrl = (url: string): boolean => {
  return url.includes('127.0.0.1') || url.includes('localhost');
};

export const ImagesTab: React.FC<Props> = ({ images, onImagesChange }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    if (!file.type.startsWith('image/')) {
      toast.error(`${file.name}: 不是有效的图片文件`);
      return null;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error(`${file.name}: 文件过大，最大支持 10MB`);
      return null;
    }

    try {
      const formData = new FormData();
      formData.append('file', file);

      const result = await uploadFileAction(formData);

      if (!result.success) {
        throw new Error(result.message || '上传失败');
      }

      // 后端返回格式: { url: string, filename: string }
      const imageUrl = result.data?.url;
      if (imageUrl) {
        return imageUrl;
      }
      return null;
    } catch (error) {
      console.error('Image upload error:', error);
      toast.error(`${file.name}: ${error instanceof Error ? error.message : '上传失败'}`);
      return null;
    }
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const maxImages = 20;
    const remainingSlots = maxImages - images.length;
    if (remainingSlots <= 0) {
      toast.error(`最多只能上传 ${maxImages} 张图片`);
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);

    setUploading(true);
    setUploadProgress(0);

    const newImages: string[] = [];

    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i];
      setUploadProgress(Math.round(((i + 1) / filesToUpload.length) * 100));

      const url = await uploadFile(file);
      if (url) {
        newImages.push(url);
      }
    }

    setUploadProgress(100);
    setUploading(false);

    if (newImages.length > 0 && onImagesChange) {
      onImagesChange([...images, ...newImages]);
      toast.success(`成功上传 ${newImages.length} 张图片`);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClick = () => {
    if (!uploading && onImagesChange) {
      fileInputRef.current?.click();
    } else if (!onImagesChange) {
      toast.error('暂不支持上传图片');
    }
  };

  return (
    <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {images.map((img, idx) => (
        <div key={idx} className="aspect-[4/3] relative rounded-2xl overflow-hidden border shadow-sm group">
          <Image 
            src={img} 
            alt="prop" 
            fill
            className="object-cover transition-transform group-hover:scale-110" 
            sizes="(max-width: 768px) 50vw, 25vw"
            unoptimized={img?.includes('127.0.0.1') || img?.includes('localhost')}
          />
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            <Eye className="text-white h-6 w-6" />
          </div>
        </div>
      ))}
      
      <div 
        onClick={handleClick}
        className="aspect-[4/3] rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-400 hover:text-indigo-600 transition-all cursor-pointer bg-slate-50/50"
      >
        {uploading ? (
          <>
            <Loader2 className="h-8 w-8 mb-1 animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-widest">{uploadProgress}%</span>
          </>
        ) : (
          <>
            <Plus className="h-8 w-8 mb-1" />
            <span className="text-[10px] font-black uppercase tracking-widest">补充实拍</span>
          </>
        )}
      </div>

      <input 
        ref={fileInputRef} 
        type="file" 
        accept="image/jpeg,image/png,image/webp,image/gif"
        multiple 
        className="hidden" 
        onChange={handleImageUpload} 
        disabled={uploading}
      />
    </div>
  );
};
