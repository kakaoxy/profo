import React from 'react';
import { Lead, LeadStatus } from '../../types';
import { STATUS_CONFIG } from '../../constants';
import { Button } from '@/components/ui/button';
import { X, LineChart } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  lead: Lead;
  onClose: () => void;
  onViewMonitor: (lead: Lead) => void;
}

export const DrawerHeader: React.FC<Props> = ({ lead, onClose, onViewMonitor }) => {
  return (
    <div className="flex items-center justify-between border-b p-6 bg-white sticky top-0 z-10">
      <div className="min-w-0 pr-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Case #{lead.id}</span>
          <LeadStatusBadge status={lead.status} />
        </div>
        <h2 className="text-2xl font-black font-geist tracking-tight truncate text-slate-900">{lead.communityName}</h2>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewMonitor(lead)}
          className="text-blue-600 border-blue-100 hover:bg-blue-50 h-9 rounded-full gap-1.5"
        >
          <LineChart className="h-4 w-4" />
          <span className="text-xs font-bold">数据大盘</span>
        </Button>
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-slate-100">
          <X className="h-5 w-5" />
        </Button>
      </div>
    </div>
  );
};

const LeadStatusBadge = ({ status }: { status: LeadStatus }) => {
  const config = STATUS_CONFIG[status];
  return (
    <span className={cn(
      "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter border",
      config.color
    )}>
      {config.label}
    </span>
  );
};
