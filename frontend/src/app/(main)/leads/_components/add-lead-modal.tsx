
import React, { useState, useRef, useMemo } from 'react';
import Image from 'next/image';
import { Lead, LeadStatus } from '../types';
import { DISTRICTS } from '../constants';
import { Button } from '@/components/ui/button';
import { X, Plus, Ruler, Building2, MapPin } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (lead: Omit<Lead, 'id' | 'createdAt'>) => void;
}

const LAYOUT_OPTIONS = ['1室0厅', '1室1厅', '2室1厅', '2室2厅', '3室1厅', '3室2厅', '4室2厅', '其他'];
const ORIENTATION_OPTIONS = ['南', '北', '东', '西', '南北', '东西'];

// Added optional children type to satisfy strict JSX property checking when content is passed between tags
const FormItem = ({ label, children }: { label: string, children?: React.ReactNode }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-bold text-slate-500 ml-1">{label}</label>
    {children}
  </div>
);

export const AddLeadModal: React.FC<Props> = ({ isOpen, onClose, onAdd }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    communityName: '',
    layout: '2室1厅',
    orientation: '南',
    floorInfo: '',
    area: '',
    totalPrice: '',
    district: DISTRICTS[0],
    businessArea: '',
    remarks: '',
  });
  const [images, setImages] = useState<string[]>([]);

  const calculatedUnitPrice = useMemo(() => {
    const area = parseFloat(formData.area);
    const total = parseFloat(formData.totalPrice);
    return (area > 0 && total > 0) ? (total / area).toFixed(2) : '0.00';
  }, [formData.area, formData.totalPrice]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => setImages(prev => [...prev, reader.result as string]);
      reader.readAsDataURL(file);
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.communityName || !formData.area || !formData.totalPrice) return;

    onAdd({
      ...formData,
      area: Number(formData.area),
      totalPrice: Number(formData.totalPrice),
      unitPrice: Number(calculatedUnitPrice),
      status: LeadStatus.PENDING_ASSESSMENT,
      images: images.length > 0 ? images : [`https://picsum.photos/seed/${Date.now()}/400/300`],
      creatorName: '运营专家 A',
    });
    setFormData({ communityName: '', layout: '2室1厅', orientation: '南', floorInfo: '', area: '', totalPrice: '', district: DISTRICTS[0], businessArea: '', remarks: '' });
    setImages([]);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
      
      <div className="relative bg-background w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-xl font-black font-sans tracking-tight">录入新线索</h2>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">FlipMaster Lead Creation</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
          <div className="space-y-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">房源名称 <span className="text-red-500">*</span></label>
              <div className="relative">
                <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input 
                  required placeholder="输入小区详细名称..."
                  className="w-full h-12 pl-10 pr-4 border rounded-xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-medium"
                  value={formData.communityName}
                  onChange={e => setFormData({...formData, communityName: e.target.value})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">所在区域</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <select 
                    className="w-full h-12 pl-10 pr-4 border rounded-xl bg-background outline-none focus:ring-2 focus:ring-primary/20 text-sm font-medium"
                    value={formData.district}
                    onChange={e => setFormData({...formData, district: e.target.value})}
                  >
                    {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">核心商圈</label>
                <input 
                  placeholder="例如: 望京"
                  className="w-full h-12 px-4 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm font-medium"
                  value={formData.businessArea}
                  onChange={e => setFormData({...formData, businessArea: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-6 rounded-2xl space-y-6 border border-slate-100">
             <div className="flex items-center gap-2 mb-2">
                <Ruler className="h-4 w-4 text-slate-400" />
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">物理指标与价格</span>
             </div>
             <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <FormItem label="房源户型">
                  <select className="w-full h-11 border rounded-lg bg-background text-sm font-medium" value={formData.layout} onChange={e => setFormData({...formData, layout: e.target.value})}>
                    {LAYOUT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </FormItem>
                <FormItem label="面积 (㎡) *">
                  <input type="number" step="0.1" className="w-full h-11 px-4 border rounded-lg outline-none text-sm font-bold" value={formData.area} onChange={e => setFormData({...formData, area: e.target.value})} />
                </FormItem>
                <FormItem label="朝向">
                  <select className="w-full h-11 border rounded-lg bg-background text-sm font-medium" value={formData.orientation} onChange={e => setFormData({...formData, orientation: e.target.value})}>
                    {ORIENTATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </FormItem>
                <FormItem label="用户报价 (万) *">
                  <input type="number" className="w-full h-11 px-4 border border-primary/20 rounded-lg outline-none text-sm font-black text-primary" value={formData.totalPrice} onChange={e => setFormData({...formData, totalPrice: e.target.value})} />
                </FormItem>
                <FormItem label="计算单价">
                  <div className="h-11 flex items-center px-4 bg-slate-100/50 rounded-lg text-xs font-black text-slate-400">{calculatedUnitPrice} 万/㎡</div>
                </FormItem>
                <FormItem label="楼层/总高">
                  <input placeholder="6/12层" className="w-full h-11 px-4 border rounded-lg outline-none text-sm font-medium" value={formData.floorInfo} onChange={e => setFormData({...formData, floorInfo: e.target.value})} />
                </FormItem>
             </div>
          </div>

          <div className="space-y-4">
            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">房源实拍</span>
            <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {images.map((img, idx) => (
                <div key={idx} className="aspect-square relative rounded-xl overflow-hidden border">
                  <Image src={img} alt="upload" fill className="object-cover" />
                  <button type="button" onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))} className="absolute top-1 right-1 h-5 w-5 bg-destructive text-white rounded-md flex items-center justify-center">
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

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">专家补充备注</label>
            <textarea 
              rows={3} placeholder="输入房源核心优势、业主动机等..."
              className="w-full p-4 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm transition-all"
              value={formData.remarks}
              onChange={e => setFormData({...formData, remarks: e.target.value})}
            />
          </div>
        </form>

        <div className="border-t p-6 flex flex-col sm:flex-row gap-3">
          <Button variant="ghost" onClick={onClose} className="order-2 sm:order-1 flex-1 h-12 rounded-xl font-bold uppercase tracking-widest text-xs">取消</Button>
          <Button onClick={handleSubmit} className="order-1 sm:order-2 flex-1 h-12 rounded-xl font-bold uppercase tracking-widest text-xs shadow-lg shadow-primary/20">确认录入线索</Button>
        </div>
      </div>
    </div>
  );
};
