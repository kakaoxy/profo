import { MiniProjectPhoto } from '../../types';
import { getFileUrl } from '@/lib/config';
import { cn } from '@/lib/utils';

interface PhotoItemProps {
  photo: MiniProjectPhoto;
  index: number;
  onDelete: (photoId: string) => void;
  isSynced?: boolean;
}

export function PhotoItem({ photo, index, onDelete, isSynced = true }: PhotoItemProps) {
  const stageLabels: Record<string, string> = {
    signing: '签约阶段',
    renovating: '硬装阶段',
    木工: '木工阶段',
    瓦工: '瓦工阶段',
    竣工: '竣工阶段',
    selling: '在售阶段',
    sold: '已售阶段',
    other: '其他',
  };
  
  const stage = photo.renovation_stage || 'other';

  return (
    <div className="flex items-center gap-4 bg-gray-50 p-3 rounded-lg border border-border-gray hover:bg-white hover:shadow-sm transition-all group">
      <div
        className="w-12 h-12 rounded bg-cover bg-center border border-border-gray flex-shrink-0 relative"
        style={{ backgroundImage: `url(${getFileUrl(photo.image_url)})` }}
      >
        <div
          className={cn(
            'absolute -top-1.5 -right-1.5 text-[9px] font-bold text-white px-1.5 py-0.5 rounded shadow-sm',
            isSynced ? 'bg-primary' : 'bg-green-500'
          )}
        >
          {isSynced ? '同步' : '上传'}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold text-text-main truncate">
          {photo.id.slice(0, 8)}
        </p>
        <p className="text-[10px] text-text-secondary">
          阶段: {stageLabels[stage] || '未设置'}
        </p>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-[10px] font-bold text-text-secondary bg-gray-200 px-1.5 py-0.5 rounded">
          #{index + 1}
        </div>
        <button
          className="text-text-secondary hover:text-accent-red transition-colors outline-none"
          onClick={() => onDelete(photo.id)}
        >
          <span className="material-symbols-outlined text-[18px]">delete</span>
        </button>
      </div>
    </div>
  );
}
