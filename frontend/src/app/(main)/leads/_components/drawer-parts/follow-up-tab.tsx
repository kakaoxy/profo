import React, { useState } from 'react';
import { Lead, FollowUpMethod, FollowUp } from '../../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { History, Eye, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLeadFollowUpsAction } from '../../actions';

interface Props {
  lead: Lead;
  followUps: FollowUp[];
  onAddFollowUp: (leadId: string, method: FollowUpMethod, content: string) => void;
  onRefreshFollowUps: (updated: FollowUp[]) => void;
}

export const FollowUpTab: React.FC<Props> = ({ lead, followUps, onAddFollowUp, onRefreshFollowUps }) => {
  const [followUpMethod, setFollowUpMethod] = useState<FollowUpMethod>('phone');
  const [followUpContent, setFollowUpContent] = useState('');

  const handleAddFollowUpSubmit = async () => {
    if (!lead || !followUpContent) return;
    await onAddFollowUp(lead.id, followUpMethod, followUpContent);
    const updated = await getLeadFollowUpsAction(lead.id);
    onRefreshFollowUps(updated);
    setFollowUpContent('');
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Quick Log */}
      <Card className="border-none shadow-sm bg-white p-5">
        <div className="flex flex-col gap-4">
           <div className="flex items-center gap-2">
             <History className="h-4 w-4 text-indigo-500" />
             <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">登记最新动态</span>
           </div>
           <div className="flex gap-2">
            <select 
              className="h-11 px-3 rounded-xl border bg-slate-50 text-xs font-bold outline-none border-slate-100"
              value={followUpMethod}
              onChange={(e) => setFollowUpMethod(e.target.value as FollowUpMethod)}
            >
              <option value="phone">电话沟通</option>
              <option value="wechat">微信联络</option>
              <option value="face">面谈记录</option>
              <option value="visit">带看实勘</option>
            </select>
            <input 
              placeholder="输入跟进摘要..."
              className="flex-1 h-11 px-4 border border-slate-100 rounded-xl text-xs outline-none focus:ring-2 focus:ring-indigo-500/20 bg-slate-50"
              value={followUpContent}
              onChange={(e) => setFollowUpContent(e.target.value)}
            />
            <Button 
              className="rounded-xl h-11 px-6 bg-indigo-600 hover:bg-indigo-700 font-bold"
              onClick={handleAddFollowUpSubmit}
            >
              记录
            </Button>
           </div>
        </div>
      </Card>

      {/* Timeline */}
      <div className="relative pl-8 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100">
        {followUps.slice().reverse().map((f, i) => (
          <TimelineItem 
            key={f.id} 
            title={f.method === 'visit' ? '阶段：带看实勘' : f.method === 'phone' ? '沟通：电话访谈' : '流转更新'} 
            desc={f.content} 
            time={f.followUpTime} 
            icon={f.method === 'visit' ? Eye : History} 
            isNewest={i === 0}
            user={f.createdBy}
          />
        ))}
        <TimelineItem 
          title="线索初始录入" 
          desc={`由专员 ${lead.creatorName} 首次采集并建档`} 
          time={lead.createdAt} 
          icon={Plus} 
        />
      </div>
    </div>
  );
};

const TimelineItem = ({ title, desc, time, icon: Icon, isNewest, user }: { title: string, desc: string, time: string, icon: React.ElementType, isNewest?: boolean, user?: string }) => (
  <div className="relative group">
    <div className={cn(
      "absolute -left-[31px] top-0 h-6 w-6 rounded-full border-4 border-white flex items-center justify-center shadow-sm transition-all",
      isNewest ? "bg-indigo-600 scale-110" : "bg-slate-200"
    )}>
      <Icon className={cn("h-2.5 w-2.5", isNewest ? "text-white" : "text-slate-500")} />
    </div>
    <div className="flex flex-col">
      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-black uppercase tracking-tight", isNewest ? "text-indigo-900" : "text-slate-700")}>{title}</span>
        <span className="text-[9px] font-bold text-slate-400">{time}</span>
      </div>
      <div className="mt-1.5 p-3 bg-white border border-slate-100 rounded-xl shadow-sm text-xs text-slate-600 leading-relaxed italic group-hover:border-indigo-100 transition-colors">
        {desc}
        {user && <div className="mt-1 flex justify-end"><span className="text-[9px] px-1.5 py-0.5 bg-slate-50 rounded text-slate-400 font-bold">{user}</span></div>}
      </div>
    </div>
  </div>
);
