import React from 'react';
import { Target, LineChart, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type TabId = 'info' | 'monitor';

interface Props {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  isMonitorFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export const TabsNav: React.FC<Props> = ({
  activeTab,
  onTabChange,
  isMonitorFullscreen,
  onToggleFullscreen,
}) => {
  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'info', label: '线索信息', icon: <Target className="h-3.5 w-3.5" /> },
    { id: 'monitor', label: '数据大盘', icon: <LineChart className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="px-6 bg-card border-b">
      <div className="flex h-12 items-center justify-between">
        <div className="flex h-12">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex items-center gap-2 px-6 text-xs font-bold uppercase tracking-widest transition-all relative",
                activeTab === tab.id ? "text-primary" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.icon}
              {tab.label}
              {activeTab === tab.id && <div className="absolute bottom-0 left-4 right-4 h-0.5 bg-primary rounded-t-full"></div>}
            </button>
          ))}
        </div>
        {activeTab === 'monitor' && onToggleFullscreen && (
          <Button variant="outline" size="sm" onClick={onToggleFullscreen}>
            {isMonitorFullscreen ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" />
                退出全屏
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" />
                全屏
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
};
