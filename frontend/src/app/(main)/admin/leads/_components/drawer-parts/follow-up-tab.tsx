import React, { useState } from 'react';
import { Lead, FollowUpMethod, FollowUp, LeadStatus } from '../../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { History, Eye, Plus, Gavel } from 'lucide-react';
import { cn } from '@/lib/utils';
import { safeParseDate } from '@/lib/validators';
import { getLeadFollowUpsAction } from '../../actions';

interface Props {
  lead: Lead;
  followUps: FollowUp[];
  onAddFollowUp: (leadId: string, method: FollowUpMethod, content: string) => void;
  onRefreshFollowUps: (updated: FollowUp[]) => void;
}

type TrailEvent = {
  key: string;
  title: string;
  desc: string;
  time: string;
  sortTime: number;
  icon: React.ElementType;
  user?: string;
};

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

  // 合并「收房评估 + 跟进记录」按时间倒序，"线索初始录入"恒为最末（创建最早）
  // 评估事件触发条件：存在任意评估信息（评估价/评估意见/审核时间）
  // auditTime 是评估发生的最可靠信号（后端在评估流转时写入）；存量无 audit_time 时回退到 evalPrice/auditReason
  const hasAssessment =
    lead.evalPrice != null || !!lead.auditReason || !!lead.auditTime;
  const trailEvents: TrailEvent[] = [];
  if (hasAssessment) {
    const raw = lead.auditTime ?? lead.updatedAt;
    const d = safeParseDate(raw);
    const isFallback = !lead.auditTime;
    const isRejected = lead.status === LeadStatus.REJECTED;
    const approvalDesc =
      lead.evalPrice != null
        ? `拟收房评估价 ¥${lead.evalPrice} 万${lead.auditReason ? ' · ' + lead.auditReason : ''}`
        : lead.auditReason
          ? `评估意见：${lead.auditReason}`
          : '评估通过，未填写评估价';
    trailEvents.push({
      key: 'audit',
      title: isRejected ? '评估驳回' : '收房评估通过',
      desc: isRejected
        ? `评估意见：${lead.auditReason || '未填写具体原因'}`
        : approvalDesc,
      time: d ? `${isFallback ? '约 ' : ''}${d.toLocaleString()}` : '-',
      sortTime: d?.getTime() ?? 0,
      icon: Gavel,
    });
  }
  followUps.forEach((f) => {
    const d = safeParseDate(f.followedAt);
    trailEvents.push({
      key: f.id,
      title: f.method === 'visit' ? '阶段：带看实勘' : f.method === 'phone' ? '沟通：电话访谈' : '流转更新',
      desc: f.content,
      time: f.followUpTime,
      sortTime: d?.getTime() ?? 0,
      icon: f.method === 'visit' ? Eye : History,
      user: f.createdBy,
    });
  });
  trailEvents.sort((a, b) => b.sortTime - a.sortTime);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Quick Log */}
      <Card className="border-none shadow-sm bg-card p-5">
        <div className="flex flex-col gap-4">
           <div className="flex items-center gap-2">
             <History className="h-4 w-4 text-primary" />
             <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">登记最新动态</span>
           </div>
           <div className="flex gap-2">
            <select
              className="h-11 px-3 rounded-xl border bg-muted text-xs font-bold outline-none border-border"
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
              className="flex-1 h-11 px-4 border border-border rounded-xl text-xs outline-none focus:ring-2 focus:ring-primary/20 bg-muted"
              value={followUpContent}
              onChange={(e) => setFollowUpContent(e.target.value)}
            />
            <Button 
              className="rounded-xl h-11 px-6 bg-primary hover:bg-primary/90 font-bold"
              onClick={handleAddFollowUpSubmit}
            >
              记录
            </Button>
           </div>
        </div>
      </Card>

      {/* Timeline */}
      <div className="relative pl-8 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-border">
        {trailEvents.map((e, i) => (
          <TimelineItem
            key={e.key}
            title={e.title}
            desc={e.desc}
            time={e.time}
            icon={e.icon}
            isNewest={i === 0}
            user={e.user}
          />
        ))}
        <TimelineItem
          title="线索初始录入"
          desc={`由 ${lead.creatorName} 首次采集并建档`}
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
      "absolute -left-[31px] top-0 h-6 w-6 rounded-full border-4 border-border flex items-center justify-center shadow-sm transition-all",
      isNewest ? "bg-primary scale-110" : "bg-muted"
    )}>
      <Icon className={cn("h-2.5 w-2.5", isNewest ? "text-primary-foreground" : "text-muted-foreground")} />
    </div>
    <div className="flex flex-col">
      <div className="flex items-center justify-between">
        <span className={cn("text-xs font-black uppercase tracking-tight", isNewest ? "text-foreground" : "text-muted-foreground")}>{title}</span>
        <span className="text-[9px] font-bold text-muted-foreground">{time}</span>
      </div>
      <div className="mt-1.5 p-3 bg-card border border-border rounded-xl shadow-sm text-xs text-muted-foreground leading-relaxed italic group-hover:border-primary/20 transition-colors">
        {desc}
        {user && <div className="mt-1 flex justify-end"><span className="text-[9px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground font-bold">{user}</span></div>}
      </div>
    </div>
  </div>
);
