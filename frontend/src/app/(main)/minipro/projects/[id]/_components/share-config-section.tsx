'use client';

import { useFormContext } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { getFileUrl } from '@/lib/config';
import { FormValues } from '../schema';

export function ShareConfigSection() {
  const form = useFormContext<FormValues>();

  return (
    <div className="pt-5 border-t border-gray-100">
      <div className="flex items-center gap-2 mb-4 text-[#111827]">
        <span className="material-symbols-outlined text-[#6b7280] text-lg">share</span>
        <h3 className="text-sm font-bold">分享配置</h3>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={form.control}
          name="share_title"
          render={({ field }) => (
            <FormItem>
              <FormLabel className='block text-xs font-bold text-[#6b7280] mb-1.5 uppercase'>分享标题 (share_title)</FormLabel>
              <FormControl>
                <Input
                  className="w-full px-3 py-2 border border-[#e5e7eb] rounded-lg text-sm bg-white focus:ring-1 focus:ring-[#137fec] focus:border-[#137fec] outline-none"
                  {...field}
                  value={field.value || ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="share_image"
          render={({ field }) => (
            <FormItem>
              <FormLabel className='block text-xs font-bold text-[#6b7280] mb-1.5 uppercase'>分享图 (share_image)</FormLabel>
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded bg-gray-100 border border-[#e5e7eb] bg-cover bg-center flex-shrink-0"
                  style={{ backgroundImage: field.value ? `url(${getFileUrl(field.value)})` : 'none' }}
                />
                <FormControl>
                  <Input className="hidden" {...field} value={field.value || ''} />
                </FormControl>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="px-3 py-1.5 bg-gray-100 text-xs font-bold rounded-lg border border-[#e5e7eb] hover:bg-gray-200 transition-colors h-8 text-[#111827]"
                  onClick={() => {
                    const url = prompt('请输入分享图 URL');
                    if (url) field.onChange(url);
                  }}
                >
                  上传图片
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
