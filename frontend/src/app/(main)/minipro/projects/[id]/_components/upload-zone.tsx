import { cn } from '@/lib/utils';

interface UploadZoneProps {
  onUpload: (files: FileList) => void;
  className?: string;
}

export function UploadZone({ onUpload, className }: UploadZoneProps) {
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      onUpload(files);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onUpload(files);
    }
  };

  return (
    <div
      className={cn(
        'border-2 border-dashed border-gray-200 rounded-lg p-5 flex flex-col items-center justify-center text-text-secondary hover:border-primary hover:text-primary hover:bg-primary/5 transition-all cursor-pointer',
        className
      )}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => document.getElementById('photo-upload')?.click()}
    >
      <input
        type="file"
        id="photo-upload"
        className="hidden"
        accept="image/*"
        multiple
        onChange={handleChange}
      />
      <span className="text-[11px] font-bold">点击或拖拽图片上传</span>
      <span className="text-[9px] opacity-60 mt-1">支持 JPG, PNG (Max 5MB)</span>
    </div>
  );
}
