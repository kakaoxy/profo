'use client';

import { Button } from '@/components/ui/button';

interface FooterActionsProps {
  onGoBack: () => void;
}

export function FooterActions({ onGoBack }: FooterActionsProps) {
  return (
    <div className="flex justify-end gap-3 pt-6 pb-12">
      <Button
        type="button"
        variant="outline"
        className="px-8 py-2.5 rounded-lg border-[#e5e7eb] font-bold text-sm hover:bg-white transition-colors h-10 text-[#111827]"
        onClick={onGoBack}
      >
        取消
      </Button>
      <Button
        type="submit"
        className="px-10 py-2.5 bg-[#137fec] text-white rounded-lg font-bold text-sm hover:bg-blue-600 shadow-md shadow-blue-100 transition-all h-10"
      >
        保存并发布
      </Button>
    </div>
  );
}
