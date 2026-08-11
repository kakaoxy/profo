import React, { useState, useMemo, useCallback } from 'react';
import { Lead, LeadStatus } from '../types';
import { Button } from '@/components/ui/button';
import { X, Ruler, MapPin, Images } from 'lucide-react';
import { CommunitySelect } from '@/components/common/community-select';
import { LayoutInputs } from '@/components/common/layout-inputs';
import { FloorInput } from '@/components/common';
import { ImageUpload } from './add-lead-parts/image-upload';
import { CommunityImagePicker, type PickerImageItem } from './community-image-picker';
import { listCommunityImagesForLeadAction } from '@/app/(main)/admin/communities/images/actions/upload-image';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (lead: Omit<Lead, 'id' | 'createdAt'>) => void;
  lead?: Lead | null;
}

const ORIENTATION_OPTIONS = ['南', '北', '东', '西', '南北', '东西'];

export const FormItem = ({ label, children, testId }: { label: string, children?: React.ReactNode, testId?: string }) => (
  <div data-testid={testId} className="space-y-1.5">
    <label className="text-[10px] font-bold text-muted-foreground ml-1">{label}</label>
    {children}
  </div>
);

export const AddLeadModal: React.FC<Props> = ({ isOpen, onClose, onAdd, lead }) => {
  const [formData, setFormData] = useState({
    communityId: '',
    communityName: '',
    layout: '2室1厅1卫',
    orientation: '南',
    floorInfo: '',
    area: '',
    totalPrice: '',
    district: '',
    businessArea: '',
    remarks: '',
  });
  const [images, setImages] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const existingUrlSet = useMemo(() => new Set(images), [images]);

  const fetchCommunityImages = useCallback(async (): Promise<PickerImageItem[]> => {
    if (!formData.communityId) return [];
    const res = await listCommunityImagesForLeadAction(formData.communityId);
    if (res.success) return res.data.items;
    return [];
  }, [formData.communityId]);

  const handlePickerSelect = useCallback((urls: string[]) => {
    if (urls.length === 0) return;
    setImages((prev) => {
      const merged = new Set(prev);
      for (const u of urls) merged.add(u);
      return Array.from(merged);
    });
  }, []);

  // Initialize form when lead changes
  React.useEffect(() => {
    if (isOpen && lead) {
        setFormData({
            communityId: lead.communityId || '',
            communityName: lead.communityName,
            layout: lead.layout || '2室1厅1卫',
            orientation: lead.orientation || '南',
            floorInfo: lead.floorInfo || '',
            area: lead.area ? String(lead.area) : '',
            totalPrice: lead.totalPrice ? String(lead.totalPrice) : '',
            district: lead.district || '',
            businessArea: lead.businessArea || '',
            remarks: lead.remarks || '',
        });
        setImages(lead.images || []);
    } else if (isOpen && !lead) {
        // Reset for add mode
        setFormData({
            communityId: '',
            communityName: '',
            layout: '2室1厅1卫',
            orientation: '南',
            floorInfo: '',
            area: '',
            totalPrice: '',
            district: '',
            businessArea: '',
            remarks: ''
        });
        setImages([]);
    }
  }, [isOpen, lead]);

  const calculatedUnitPrice = useMemo(() => {
    const area = parseFloat(formData.area);
    const total = parseFloat(formData.totalPrice);
    return (area > 0 && total > 0) ? (total / area).toFixed(2) : '0.00';
  }, [formData.area, formData.totalPrice]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.communityName || !formData.area || !formData.totalPrice) return;

    onAdd({
      communityId: formData.communityId || undefined,
      communityName: formData.communityName,
      layout: formData.layout,
      orientation: formData.orientation,
      floorInfo: formData.floorInfo,
      area: Number(formData.area),
      totalPrice: Number(formData.totalPrice),
      unitPrice: Number(calculatedUnitPrice),
      district: formData.district,
      businessArea: formData.businessArea,
      remarks: formData.remarks,
      status: lead?.status || LeadStatus.PENDING_ASSESSMENT,
      images: images.length > 0 ? images : [],
      creatorName: lead?.creatorName || '运营',
    });

    // Close modal (state reset happens in useEffect when re-opened or lead changes)
    onClose();
  };

  if (!isOpen) return null;

  const isEdit = !!lead;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-in fade-in" onClick={onClose} />
      
      <div className="relative bg-background w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300">
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div>
            <h2 className="text-xl font-black font-sans tracking-tight">{isEdit ? '编辑线索' : '录入新线索'}</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full" aria-label="关闭对话框">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
          <div className="space-y-6">
          <div data-testid="field-community-name">
            <CommunitySelect
                value={formData.communityName}
                label="房源名称"
                onChange={(community) =>
                  setFormData((prev) => ({
                    ...prev,
                    communityId: community.id,
                    communityName: community.name,
                    district: community.district || prev.district,
                    businessArea:
                      community.businessCircle || prev.businessArea,
                  }))
                }
            />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">所在区域</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input 
                    placeholder="例如: 静安区"
                    className="w-full h-12 pl-10 pr-4 border rounded-xl bg-background outline-none focus:ring-2 focus:ring-primary/20 text-sm font-medium"
                    value={formData.district}
                    onChange={e => setFormData({...formData, district: e.target.value})}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">核心商圈</label>
                <input 
                  placeholder="例如: 彭浦"
                  className="w-full h-12 px-4 border rounded-xl outline-none focus:ring-2 focus:ring-primary/20 text-sm font-medium"
                  value={formData.businessArea}
                  onChange={e => setFormData({...formData, businessArea: e.target.value})}
                />
              </div>
            </div>
          </div>

          <div className="bg-muted p-6 rounded-2xl space-y-6 border border-border">
             <div className="flex items-center gap-2 mb-2">
                <Ruler className="h-4 w-4 text-muted-foreground" />
                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">物理指标与价格</span>
             </div>
             <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="col-span-2 sm:col-span-3">
                    <LayoutInputs value={formData.layout} onChange={l => setFormData(prev => ({...prev, layout: l}))} />
                </div>
                
                <FormItem label="面积 (㎡) *" testId="field-area">
                  <input type="number" step="0.1" className="w-full h-11 px-4 border rounded-lg outline-none text-sm font-bold bg-background" value={formData.area} onChange={e => setFormData({...formData, area: e.target.value})} />
                </FormItem>
                <FormItem label="朝向">
                  <select className="w-full h-11 border rounded-lg bg-background text-sm font-medium" value={formData.orientation} onChange={e => setFormData({...formData, orientation: e.target.value})}>
                    {ORIENTATION_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </FormItem>
                <FormItem label="楼层/总高">
                  <FloorInput
                    value={formData.floorInfo}
                    onChange={(floorInfo) => setFormData({ ...formData, floorInfo })}
                  />
                </FormItem>
                <FormItem label="用户报价 (万) *">
                  <input type="number" className="w-full h-11 px-4 border border-primary/20 rounded-lg outline-none text-sm font-black text-primary bg-background" value={formData.totalPrice} onChange={e => setFormData({...formData, totalPrice: e.target.value})} />
                </FormItem>
                <FormItem label="计算单价">
                  <div className="h-11 flex items-center px-4 bg-muted rounded-lg text-xs font-black text-muted-foreground">{calculatedUnitPrice} 万/㎡</div>
                </FormItem>
             </div>
          </div>

          <ImageUpload images={images} onChange={setImages} />

          {/* 从小区户型图库选择 */}
          <button
            type="button"
            disabled={!formData.communityId}
            onClick={() => setPickerOpen(true)}
            className="w-full flex items-center justify-center gap-2 h-11 rounded-xl border border-border bg-background text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed hover:border-primary/40"
          >
            <Images className="h-4 w-4" />
            {formData.communityId ? '从小区户型图库选择' : '请先选择小区后可从户型图库选择'}
          </button>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">补充信息</label>
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
          <Button onClick={handleSubmit} className="order-1 sm:order-2 flex-1 h-12 rounded-xl font-bold uppercase tracking-widest text-xs shadow-lg shadow-primary/20">
            {isEdit ? '保存修改' : '确认录入线索'}
          </Button>
        </div>
      </div>

      {/* 户型图库选择器 */}
      <CommunityImagePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        fetchImages={fetchCommunityImages}
        existingUrls={existingUrlSet}
        onSelect={handlePickerSelect}
      />
    </div>
  );
};
