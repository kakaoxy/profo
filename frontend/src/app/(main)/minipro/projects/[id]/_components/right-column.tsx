'use client';

import { useFormContext } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { getFileUrl } from '@/lib/config';
import { FormValues } from '../schema';
import { Consultant } from '../../types';

interface RightColumnProps {
  consultants: Consultant[];
}

export function RightColumn({ consultants }: RightColumnProps) {
  const form = useFormContext<FormValues>();

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg border border-[#e5e7eb] shadow-[0_1px_3px_0_rgba(0,0,0,0.05)] p-6 space-y-6">
        <FormField
          control={form.control}
          name="cover_image"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="block text-xs font-bold text-[#6b7280] mb-3 uppercase">项目封面图 (cover_image)</FormLabel>
              <div className="relative group rounded-xl aspect-[3/2] border border-[#e5e7eb] overflow-hidden bg-gray-50">
                {field.value ? (
                  <div
                    className="absolute inset-0 bg-cover bg-center"
                    style={{ backgroundImage: `url(${getFileUrl(field.value)})` }}
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[#6b7280]">
                    <span className="material-symbols-outlined text-4xl">image</span>
                  </div>
                )}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <Button
                    type="button"
                    variant="secondary"
                    className="bg-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg h-9 text-[#111827]"
                    onClick={() => {
                      const url = prompt('请输入封面图 URL');
                      if (url) field.onChange(url);
                    }}
                  >
                    <span className="material-symbols-outlined text-lg">cloud_upload</span>
                    更换封面
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-[10px] text-[#6b7280] italic">建议尺寸：1200×800px，最大 5MB</p>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="pt-6 border-t border-gray-100">
          <FormField
            control={form.control}
            name="consultant_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="block text-xs font-bold text-[#6b7280] mb-3 uppercase">关联顾问 (consultant_id)</FormLabel>
                <div className="relative">
                  <Select onValueChange={field.onChange} defaultValue={field.value || undefined}>
                    <FormControl>
                      <SelectTrigger className="w-full px-10 py-2.5 border border-[#e5e7eb] rounded-lg text-sm bg-white h-11 focus:ring-1 focus:ring-[#137fec] focus:border-[#137fec] outline-none text-[#111827]">
                        <SelectValue placeholder="选择顾问" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="none">无顾问</SelectItem>
                      {consultants.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name} - {c.role || '顾问'}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                    <span className="material-symbols-outlined text-[#137fec] text-xl">account_circle</span>
                  </div>
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </div>
  );
}
