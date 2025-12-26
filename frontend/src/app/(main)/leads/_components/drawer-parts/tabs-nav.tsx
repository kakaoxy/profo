import React from 'react';
import { Target, Image as ImageIcon, History } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TabId = 'info' | 'images' | 'followup';

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  imagesCount: number;
}

export const TabsNav: React.FC<Props> = ({ activeTab, onTabChange, imagesCount }) => {
  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'info', label: '决策面板', icon: <Target className="h-3.5 w-3.5" /> },
    { id: 'images', label: `影像库 (${imagesCount})`, icon: <ImageIcon className="h-3.5 w-3.5" /> },
    { id: 'followup', label: '流转轨迹', icon: <History className="h-3.5 w-3.5" /> }
  ];

  return (
    <div className="px-6 bg-white border-b">
      <div className="flex h-12">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex items-center gap-2 px-6 text-xs font-bold uppercase tracking-widest transition-all relative",
              activeTab === tab.id ? "text-indigo-600" : "text-slate-400 hover:text-slate-600"
            )}
          >
            {tab.icon}
            {tab.label}
            {activeTab === tab.id && <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-indigo-600 rounded-t-full"></div>}
          </button>
        ))}
      </div>
    </div>
  );
};
