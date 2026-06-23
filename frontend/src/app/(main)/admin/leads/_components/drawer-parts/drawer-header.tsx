import React from 'react';
import { Lead, LeadStatus } from '../../types';
import { getStatusStyleConfig } from '@/lib/status-colors';
import { Button } from '@/components/ui/button';
import { LineChart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  lead: Lead;
  onViewMonitor: (lead: Lead) => void;
}

export const DrawerHeader: React.FC<Props> = ({ lead, onViewMonitor }) => {
  return (
    <div className="flex items-center justify-between border-b p-6 bg-card shrink-0">
      <div className="min-w-0 pr-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Case #{lead.id}</span>
          <LeadStatusBadge status={lead.status} />
        </div>
        <h2 className="text-2xl font-black font-geist tracking-tight truncate text-foreground">{lead.communityName}</h2>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewMonitor(lead)}
          className="text-primary border-primary/20 hover:bg-primary/5 h-9 rounded-full gap-1.5"
        >
          <LineChart className="h-4 w-4" />
          <span className="text-xs font-bold">数据大盘</span>
        </Button>
      </div>
    </div>
  );
};

const LeadStatusBadge = ({ status }: { status: LeadStatus }) => {
  const config = getStatusStyleConfig(status);
  return (
    <span className={cn(
      "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter border",
      config.className
    )}>
      {config.label}
    </span>
  );
};
