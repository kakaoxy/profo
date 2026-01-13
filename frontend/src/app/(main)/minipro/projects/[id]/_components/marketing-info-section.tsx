'use client';

import { useFormContext } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FormValues } from '../schema';
import { ShareConfigSection } from './share-config-section';

interface MarketingInfoSectionProps {
  tagInput: string;
  onTagInputChange: (value: string) => void;
  onAddTag: (e: React.KeyboardEvent) => void;
  onRemoveTag: (tag: string) => void;
}

export function MarketingInfoSection({ tagInput, onTagInputChange, onAddTag, onRemoveTag }: MarketingInfoSectionProps) {
  const form = useFormContext<FormValues>();

  return (
    <section className="bg-white rounded-lg border border-[#e5e7eb] shadow-[0_1px_3px_0_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-50 flex items-center gap-2">
        <span className="material-symbols-outlined text-[#137fec]">campaign</span>
        <h2 className="font-bold text-base text-[#111827]">营销信息</h2>
      </div>
      <div className="p-6 space-y-5">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel className='block text-xs font-bold text-[#6b7280] mb-1.5 uppercase'>营销标题 (title)</FormLabel>
              <FormControl>
                <Input
                  className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm bg-white focus:ring-1 focus:ring-[#137fec] focus:border-[#137fec] outline-none"
                  placeholder="例如：徐汇核心区，尊享园林景观生活"
                  {...field}
                  value={field.value || ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="style"
            render={({ field }) => (
              <FormItem>
                <FormLabel className='block text-xs font-bold text-[#6b7280] mb-1.5 uppercase'>物业风格 (style)</FormLabel>
                <FormControl>
                  <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                    <SelectTrigger className='w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm bg-white h-10 focus:ring-1 focus:ring-[#137fec] focus:border-[#137fec] outline-none'>
                      <SelectValue placeholder='选择风格' />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value='现代奢华'>现代奢华</SelectItem>
                      <SelectItem value='欧式经典'>欧式经典</SelectItem>
                      <SelectItem value='简约禅意'>简约禅意</SelectItem>
                      <SelectItem value='新中式'>新中式</SelectItem>
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="sort_order"
            render={({ field }) => (
              <FormItem>
                <FormLabel className='block text-xs font-bold text-[#6b7280] mb-1.5 uppercase'>排序权重 (sort_order)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm bg-white focus:ring-1 focus:ring-[#137fec] focus:border-[#137fec] outline-none"
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="marketing_tags"
          render={({ field }) => (
            <FormItem>
              <FormLabel className='block text-xs font-bold text-[#6b7280] mb-1.5 uppercase'>营销标签 (marketing_tags)</FormLabel>
              <div className="flex flex-wrap gap-2 p-2 border border-[#e5e7eb] rounded-lg bg-gray-50/50">
                {field.value?.map((tag: string) => (
                  <span key={tag} className="bg-[#137fec]/10 text-[#137fec] text-[11px] font-bold px-2 py-1 rounded flex items-center gap-1">
                    {tag}
                    <span
                      className="material-symbols-outlined text-sm cursor-pointer hover:text-blue-700"
                      onClick={() => onRemoveTag(tag)}
                    >
                      close
                    </span>
                  </span>
                ))}
                <input
                  className="flex-1 min-w-[100px] border-none bg-transparent text-sm p-0 focus:ring-0 outline-none placeholder:text-[#6b7280]/50"
                  placeholder="添加标签..."
                  value={tagInput}
                  onChange={(e) => onTagInputChange(e.target.value)}
                  onKeyDown={onAddTag}
                />
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel className='block text-xs font-bold text-[#6b7280] mb-1.5 uppercase'>项目描述 (description)</FormLabel>
              <FormControl>
                <Textarea
                  className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm bg-white resize-none min-h-[100px] focus:ring-1 focus:ring-[#137fec] focus:border-[#137fec] outline-none"
                  rows={4}
                  placeholder="描述项目特色..."
                  {...field}
                  value={field.value || ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <ShareConfigSection />
      </div>
    </section>
  );
}
