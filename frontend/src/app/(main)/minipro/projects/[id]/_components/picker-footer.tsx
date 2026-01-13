'use client';

import { Button } from '@/components/ui/button';
import { Loader2, Plus } from 'lucide-react';

interface PickerFooterProps {
  selectedCount: number;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

export function PickerFooter({ selectedCount, submitting, onCancel, onSubmit }: PickerFooterProps) {
  return (
    <div className="flex items-center justify-between w-full">
      <div>
        <p className="font-bold">
          已选择 {selectedCount} 张照片
        </p>
        <p className="text-sm text-muted-foreground">
          照片将同步至当前小程序项目
        </p>
      </div>
      <div className="flex gap-3">
        <Button variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button
          onClick={onSubmit}
          disabled={selectedCount === 0 || submitting}
          className="gap-2"
        >
          {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
          <Plus className="w-4 h-4" />
          确定添加
        </Button>
      </div>
    </div>
  );
}
