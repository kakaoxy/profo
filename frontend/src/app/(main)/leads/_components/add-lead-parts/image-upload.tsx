import React, { useRef } from 'react';
import Image from 'next/image';
import { X, Plus } from 'lucide-react';

interface Props {
  images: string[];
  onChange: (images: string[]) => void;
}

export const ImageUpload: React.FC<Props> = ({ images, onChange }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => onChange([...images, reader.result as string]);
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeImage = (index: number) => {
    onChange(images.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">房源实拍</span>
      <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
        {images.map((img, idx) => (
          <div key={idx} className="aspect-square relative rounded-xl overflow-hidden border group">
            <Image src={img} alt="upload" fill className="object-cover" sizes="100px" />
            <button 
                type="button" 
                onClick={() => removeImage(idx)} 
                className="absolute top-1 right-1 h-5 w-5 bg-black/50 text-white rounded-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button 
          type="button" onClick={() => fileInputRef.current?.click()}
          className="aspect-square border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-slate-300 hover:text-primary hover:border-primary/40 transition-all bg-slate-50/50"
        >
          <Plus className="h-6 w-6 mb-1" />
          <span className="text-[8px] font-black uppercase tracking-widest">ADD PIC</span>
        </button>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />
    </div>
  );
};
