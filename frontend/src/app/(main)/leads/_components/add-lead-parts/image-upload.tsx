'use client';

import React, { useRef, useState, useCallback } from 'react';
import Image from 'next/image';
import { X, Plus, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { API_BASE_URL } from '@/lib/config';

interface Props {
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
  maxFileSize?: number; // in MB
}

// API_BASE_URL is imported from @/lib/config

/**
 * 检查是否为本地开发环境的 URL（私有 IP）
 * Next.js Image 组件对本地开发环境的 URL 需要特殊处理
 */
const isLocalDevUrl = (url: string): boolean => {
  return url.includes('127.0.0.1') || url.includes('localhost');
};

/**
 * 图片上传组件 - 符合 Next.js 最佳实践
 * 
 * 特性：
 * - 使用 next/image 进行图片优化
 * - 对本地开发环境使用 unoptimized 避免私有 IP 限制
 * - 使用服务器端上传而非 base64 存储
 * - 支持多图片上传和删除
 */
export const ImageUpload: React.FC<Props> = ({ 
  images, 
  onChange,
  maxImages = 10,
  maxFileSize = 10, // 默认 10MB
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const uploadFile = useCallback(async (file: File): Promise<string | null> => {
    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      toast.error(`${file.name}: 不是有效的图片文件`);
      return null;
    }
    
    // 验证文件大小
    if (file.size > maxFileSize * 1024 * 1024) {
      toast.error(`${file.name}: 文件过大，最大支持 ${maxFileSize}MB`);
      return null;
    }
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${API_BASE_URL}/api/v1/files/upload`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || `上传失败: ${response.status}`);
      }
      
      const result = await response.json();
      // 后端返回的 URL 可能是相对路径，需要拼接完整 URL
      const imageUrl = result.data?.url || result.url || result.file_url || result.path;
      if (imageUrl) {
        return imageUrl.startsWith('/') ? `${API_BASE_URL}${imageUrl}` : imageUrl;
      }
      return null;
    } catch (error) {
      console.error('Image upload error:', error);
      toast.error(`${file.name}: ${error instanceof Error ? error.message : '上传失败'}`);
      return null;
    }
  }, [maxFileSize]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
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
      setUploadProgress(Math.round((i / filesToUpload.length) * 100));
      
      const url = await uploadFile(file);
      if (url) {
        newImages.push(url);
      }
    }
    
    setUploadProgress(100);
    setUploading(false);
    
    if (newImages.length > 0) {
      onChange([...images, ...newImages]);
      toast.success(`成功上传 ${newImages.length} 张图片`);
    }
    
    // 清空 input 以允许重复上传同一文件
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = useCallback((index: number) => {
    onChange(images.filter((_, i) => i !== index));
  }, [images, onChange]);

  const canAddMore = images.length < maxImages;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">
          房源实拍
        </span>
        <span className="text-[10px] text-muted-foreground">
          {images.length}/{maxImages}
        </span>
      </div>
      
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {images.map((img, idx) => (
          <div 
            key={`${img}-${idx}`} 
            className="aspect-square relative rounded-xl overflow-hidden border group bg-slate-50"
          >
            {/* 
              使用 next/image 保持优化能力
              对于本地开发环境 URL 使用 unoptimized 避免私有 IP 限制
              生产环境会自动进行图片优化
            */}
            <Image 
              src={img} 
              alt={`房源图片 ${idx + 1}`}
              fill
              className="object-cover transition-transform duration-300 group-hover:scale-105" 
              sizes="(max-width: 640px) 33vw, (max-width: 1024px) 25vw, 20vw"
              unoptimized={isLocalDevUrl(img)}
              priority={idx === 0}
            />
            <button 
              type="button" 
              onClick={() => removeImage(idx)} 
              className="absolute top-1 right-1 h-6 w-6 bg-black/60 text-white rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
              aria-label={`删除图片 ${idx + 1}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        
        {canAddMore && (
          <button 
            type="button" 
            onClick={() => !uploading && fileInputRef.current?.click()}
            disabled={uploading}
            className="aspect-square border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-slate-400 hover:text-primary hover:border-primary/40 transition-all bg-slate-50/50 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="添加图片"
          >
            {uploading ? (
              <div className="flex flex-col items-center gap-1">
                <Loader2 className="h-6 w-6 animate-spin" />
                <span className="text-[8px] font-black uppercase tracking-widest">
                  {uploadProgress}%
                </span>
              </div>
            ) : (
              <>
                <Plus className="h-6 w-6 mb-1" />
                <span className="text-[8px] font-black uppercase tracking-widest">ADD PIC</span>
              </>
            )}
          </button>
        )}
        
        {!canAddMore && images.length >= maxImages && (
          <div className="aspect-square border-2 border-dashed border-amber-200 rounded-xl flex flex-col items-center justify-center text-amber-500 bg-amber-50/50">
            <AlertCircle className="h-5 w-5 mb-1" />
            <span className="text-[8px] font-black uppercase tracking-widest">已满</span>
          </div>
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
