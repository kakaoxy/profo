import React from 'react';
import Image from 'next/image';
import { Eye, Plus } from 'lucide-react';

interface Props {
  images: string[];
}

export const ImagesTab: React.FC<Props> = ({ images }) => {
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
      <div className="aspect-[4/3] rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-indigo-400 hover:text-indigo-600 transition-all cursor-pointer bg-slate-50/50">
        <Plus className="h-8 w-8 mb-1" />
        <span className="text-[10px] font-black uppercase tracking-widest">补充实拍</span>
      </div>
    </div>
  );
};
