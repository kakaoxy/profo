'use client';

import { useFormContext } from 'react-hook-form';
import { FormField, FormItem, FormControl } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { FormValues } from '../schema';
import { MiniProject } from '../../types';

interface FormHeaderProps {
  project: MiniProject;
  onSaveDraft: () => void;
  onGoBack: () => void;
}

export function FormHeader({ project, onSaveDraft, onGoBack }: FormHeaderProps) {
  const form = useFormContext<FormValues>();

  return (
    <header className="bg-white border-b border-[#e5e7eb] px-8 py-4 sticky top-0 z-10 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onGoBack}
          className="hover:bg-gray-100 p-1 rounded-full transition-colors"
        >
          <span className="material-symbols-outlined text-[#111827]">arrow_back</span>
        </button>
        <div>
          <h1 className="text-xl font-bold text-[#111827]">编辑小程序项目</h1>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="hidden md:flex items-center gap-1.5 text-sm text-[#6b7280] border-r border-[#e5e7eb] pr-6">
          <span className="material-symbols-outlined text-lg">visibility</span>
          <span>浏览量: {project.view_count || 0}</span>
        </div>
        <div className="flex items-center gap-3 bg-gray-50 px-3 py-1.5 rounded-lg border border-[#e5e7eb]">
          <span className="text-xs font-bold text-[#6b7280]">发布状态</span>
          <FormField
            control={form.control}
            name="is_published"
            render={({ field }) => (
              <FormItem className="flex items-center space-y-0">
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    className="data-[state=checked]:bg-[#137fec]"
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="px-4 py-2 border-[#e5e7eb] text-sm font-bold rounded-lg hover:bg-gray-50 transition-colors h-10 text-[#111827]"
            onClick={onSaveDraft}
          >
            保存草稿
          </Button>
          <Button
            type="submit"
            className="px-6 py-2 bg-[#137fec] text-white text-sm font-bold rounded-lg hover:bg-blue-600 transition-shadow shadow-sm shadow-blue-100 h-10"
          >
            发布更改
          </Button>
        </div>
      </div>
    </header>
  );
}
