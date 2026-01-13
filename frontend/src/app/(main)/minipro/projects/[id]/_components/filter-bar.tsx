'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StageOption, STAGE_OPTIONS } from './types';

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  activeStage: StageOption;
  onStageChange: (stage: StageOption) => void;
  selectedCount: number;
  totalCount: number;
  onToggleAll: () => void;
}

export function FilterBar({
  searchQuery,
  onSearchChange,
  activeStage,
  onStageChange,
  selectedCount,
  totalCount,
  onToggleAll,
}: FilterBarProps) {
  return (
    <div className="px-6 py-4 space-y-4 border-b border-gray-100">
      <div className="flex items-center gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            placeholder="搜索ID或描述..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button variant="outline" onClick={onToggleAll} className="gap-2">
          <Check className="w-4 h-4" />
          {selectedCount === totalCount && totalCount > 0 ? '取消全选' : '全选'}
        </Button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
        {STAGE_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={activeStage === option.value ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'gap-1 whitespace-nowrap flex-shrink-0',
              activeStage === option.value && 'bg-primary'
            )}
            onClick={() => onStageChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
