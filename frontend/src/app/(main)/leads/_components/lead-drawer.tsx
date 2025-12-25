
import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Lead, LeadStatus, FollowUpMethod } from '../types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { STATUS_CONFIG } from '../constants';
import { getLeadFollowUpsAction, getLeadPriceHistoryAction } from '../actions';
import { FollowUp, PriceHistory } from '../types';
import { 
  X, Plus, MapPin, Ruler, Home, User, Calendar, 
  Image as ImageIcon, History, ChevronRight, FileCheck,
  LineChart, Activity, TrendingUp, PieChart, Timer,
  BarChart3
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  lead: Lead | null;
  isOpen: boolean;
  onClose: () => void;
  onAudit: (leadId: string, status: LeadStatus, evalPrice?: number, reason?: string) => void;
  onAddFollowUp: (leadId: string, method: FollowUpMethod, content: string) => void;
  onViewMonitor: (lead: Lead) => void;
}

export const LeadDrawer: React.FC<Props> = ({ lead, isOpen, onClose, onAudit, onAddFollowUp, onViewMonitor }) => {
  const [activeTab, setActiveTab] = useState<'info' | 'images' | 'followup'>('info');
  const [auditReason, setAuditReason] = useState('');
  const [evalPrice, setEvalPrice] = useState<number | ''>('');
  const [followUpMethod, setFollowUpMethod] = useState<FollowUpMethod>('phone');
  const [followUpContent, setFollowUpContent] = useState('');
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);

  // Fetch details when lead changes
  useEffect(() => {
    if (lead && isOpen) {
       getLeadFollowUpsAction(lead.id).then(setFollowUps);
       getLeadPriceHistoryAction(lead.id).then(setPriceHistory);
    }
  }, [lead, isOpen]);

  const handleAddFollowUpSubmit = async () => {
    if (!lead || !followUpContent) return;
    await onAddFollowUp(lead.id, followUpMethod, followUpContent);
    // Refresh local list
    const updated = await getLeadFollowUpsAction(lead.id);
    setFollowUps(updated);
    setFollowUpContent('');
  };

  const handleClose = () => {
    setAuditReason('');
    setEvalPrice('');
    setActiveTab('info');
    onClose();
  };

  if (!lead) return null;

  const statusLabel = STATUS_CONFIG[lead.status]?.label || lead.status;

  return (
    <>
      <div 
        className={cn("fixed inset-0 bg-black/40 z-40 transition-opacity duration-300", isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none')}
        onClick={handleClose}
      />
      
      <div className={cn(
        "fixed inset-y-0 right-0 w-full sm:w-[500px] md:w-[600px] bg-background z-50 transform transition-transform duration-300 ease-in-out shadow-2xl flex flex-col",
        isOpen ? 'translate-x-0' : 'translate-x-full'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between border-b p-6 bg-white sticky top-0 z-10">
          <div className="min-w-0 pr-4">
            <h2 className="text-xl font-black font-sans tracking-tight truncate">{lead.communityName}</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">ID: {lead.id}</span>
              <span className="h-1 w-1 rounded-full bg-slate-300"></span>
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{lead.createdAt}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onViewMonitor(lead)}
              className="text-slate-400 hover:text-blue-600 hover:bg-blue-50 h-8 px-3 flex items-center gap-1.5 transition-all rounded-full"
            >
              <LineChart className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs font-medium">监控</span>
            </Button>
            <Button variant="ghost" size="icon" onClick={handleClose} className="rounded-full">
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 border-b bg-slate-50/50">
          <div className="flex h-12">
            {[
              { id: 'info', label: '基础信息', icon: <Home className="h-3.5 w-3.5" /> },
              { id: 'images', label: `影像资料 (${lead.images.length})`, icon: <ImageIcon className="h-3.5 w-3.5" /> },
              { id: 'followup', label: '跟进记录', icon: <History className="h-3.5 w-3.5" /> }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as 'info' | 'images' | 'followup')}
                className={cn(
                  "flex items-center gap-2 px-4 text-xs font-bold uppercase tracking-widest transition-all relative",
                  activeTab === tab.id ? "text-primary" : "text-muted-foreground hover:text-slate-900"
                )}
              >
                {tab.icon}
                {tab.label}
                {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full"></div>}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar">
          {activeTab === 'info' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="grid grid-cols-2 gap-y-6 gap-x-8">
                <InfoItem label="当前状态" value={<Badge variant="secondary" className="font-bold">{statusLabel}</Badge>} />
                <InfoItem label="报价详情" value={
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-col">
                      <span className="text-xl font-black text-primary">¥ {lead.totalPrice} 万</span>
                      <span className="text-[10px] text-muted-foreground font-bold">{lead.unitPrice?.toFixed(2)} 万/㎡</span>
                    </div>
                    {priceHistory.length > 0 && (
                      <div className="mt-2 space-y-1 bg-slate-100 p-2 rounded-lg">
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">历史调价</span>
                        {priceHistory.slice(0, 3).map(ph => (
                          <div key={ph.id} className="flex justify-between text-[10px] text-slate-500">
                             <span>{ph.recordedAt.split(' ')[0]}</span>
                             <span className="font-bold">¥{ph.price}万</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                } />
                <InfoItem icon={<Ruler className="h-3.5 w-3.5" />} label="房源规格" value={`${lead.layout} · ${lead.area} ㎡`} />
                <InfoItem icon={<MapPin className="h-3.5 w-3.5" />} label="位置商圈" value={`${lead.district} - ${lead.businessArea}`} />
              </div>

              <Card className="bg-slate-50/50 border-none">
                <CardContent className="p-4 space-y-2">
                  <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">专家备注</span>
                  <p className="text-sm italic text-slate-600 leading-relaxed">&quot;{lead.remarks || '暂无详细备注说明'}&quot;</p>
                </CardContent>
              </Card>

              {/* Real-time Market Monitoring Preview */}
              <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50/30 to-indigo-50/30 p-5 overflow-hidden relative group">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-md">
                      <Activity className="h-4 w-4" />
                    </div>
                    <span className="font-sans font-black text-blue-900 tracking-tight uppercase text-xs">实时市场动态</span>
                  </div>
                  <Badge variant="outline" className="bg-white/50 text-blue-700 border-blue-200">
                    <TrendingUp className="h-3 w-3 mr-1" /> 商圈活跃
                  </Badge>
                </div>
                
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white/60 p-3 rounded-xl border border-white/80">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                      <PieChart className="h-3 w-3" />
                      <span className="text-[9px] font-bold uppercase tracking-wider">挂牌量</span>
                    </div>
                    <div className="text-lg font-black text-slate-900">156 <span className="text-[10px] font-normal text-slate-400">套</span></div>
                  </div>
                  <div className="bg-white/60 p-3 rounded-xl border border-white/80">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                      <BarChart3 className="h-3 w-3" />
                      <span className="text-[9px] font-bold uppercase tracking-wider">成交(12M)</span>
                    </div>
                    <div className="text-lg font-black text-slate-900">84 <span className="text-[10px] font-normal text-slate-400">套</span></div>
                  </div>
                  <div className="bg-white/60 p-3 rounded-xl border border-white/80">
                    <div className="flex items-center gap-1.5 text-slate-400 mb-1">
                      <Timer className="h-3 w-3" />
                      <span className="text-[9px] font-bold uppercase tracking-wider">去化压力</span>
                    </div>
                    <div className="text-lg font-black text-amber-600">22.3 <span className="text-[10px] font-normal text-slate-400">月</span></div>
                  </div>
                </div>
                
                <Button 
                  variant="link" 
                  size="sm" 
                  onClick={() => onViewMonitor(lead)}
                  className="mt-4 w-full text-blue-600 font-bold text-xs uppercase tracking-widest h-auto p-0 hover:no-underline hover:text-blue-700"
                >
                  查看区域供需全景 <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </div>

              {/* Audit Controls */}
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 ml-1">管理动作</h3>
                {lead.status === LeadStatus.PENDING_ASSESSMENT ? (
                  <div className="grid grid-cols-2 gap-3">
                    <Button className="h-12 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700" onClick={() => onAudit(lead.id, LeadStatus.PENDING_VISIT, evalPrice || undefined, auditReason)}>
                      通过审核
                    </Button>
                    <Button variant="outline" className="h-12 rounded-xl font-bold border-red-200 text-red-600 hover:bg-red-50" onClick={() => onAudit(lead.id, LeadStatus.REJECTED, undefined, auditReason)}>
                      直接驳回
                    </Button>
                  </div>
                ) : lead.status === LeadStatus.PENDING_VISIT ? (
                  <Button 
                    className="w-full h-12 rounded-xl font-bold bg-orange-600 hover:bg-orange-700"
                    onClick={() => onAudit(lead.id, LeadStatus.VISITED)}
                  >
                    确认看房完成
                  </Button>
                ) : lead.status === LeadStatus.VISITED ? (
                  <Button 
                    className="w-full h-12 rounded-xl font-bold bg-indigo-600 hover:bg-indigo-700 gap-2"
                    onClick={() => onAudit(lead.id, LeadStatus.SIGNED)}
                  >
                    <FileCheck className="h-4 w-4" /> 标记为已签约
                  </Button>
                ) : (
                  <div className="bg-slate-100 p-4 rounded-xl flex items-center gap-3 text-xs font-bold text-slate-500 uppercase tracking-widest">
                    <Calendar className="h-4 w-4" /> 流程已归档 - {statusLabel}
                  </div>
                )}
                {lead.status === LeadStatus.PENDING_ASSESSMENT && (
                  <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 ml-1">评估价格 (万元)</label>
                      <input 
                        type="number" 
                        placeholder="输入评估预收价..."
                        className="w-full h-11 px-4 border rounded-xl focus:ring-2 focus:ring-primary/20 outline-none transition-all font-bold text-primary"
                        value={evalPrice}
                        onChange={(e) => setEvalPrice(Number(e.target.value))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-500 ml-1">审核意见</label>
                      <textarea 
                        rows={3}
                        placeholder="输入通过或驳回的详细理由..."
                        className="w-full p-4 border rounded-xl focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
                        value={auditReason}
                        onChange={(e) => setAuditReason(e.target.value)}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'images' && (
            <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-300">
              {lead.images.map((img, idx) => (
                <div key={idx} className="aspect-video relative rounded-2xl overflow-hidden border shadow-sm group">
                  <Image src={img} className="object-cover transition-transform group-hover:scale-110" alt="prop" fill sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw" />
                </div>
              ))}
              <div className="aspect-video rounded-2xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400 hover:border-primary/40 hover:text-primary transition-all cursor-pointer bg-slate-50/50">
                <Plus className="h-8 w-8 mb-2" />
                <span className="text-[10px] font-bold uppercase tracking-widest">补充影像</span>
              </div>
            </div>
          )}

          {activeTab === 'followup' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <Card className="bg-slate-50/50 border-none">
                <CardContent className="p-4 space-y-4">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">快速记录跟进</span>
                  <div className="flex gap-2">
                    <select 
                      className="h-10 px-2 rounded-lg border bg-white text-xs font-bold outline-none"
                      value={followUpMethod}
                      onChange={(e) => setFollowUpMethod(e.target.value as FollowUpMethod)}
                    >
                      <option value="phone">电话</option>
                      <option value="wechat">微信</option>
                      <option value="face">面谈</option>
                      <option value="visit">实勘</option>
                    </select>
                    <input 
                      placeholder="跟进摘要..."
                      className="flex-1 h-10 px-4 border rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20"
                      value={followUpContent}
                      onChange={(e) => setFollowUpContent(e.target.value)}
                    />
                    <Button size="sm" onClick={handleAddFollowUpSubmit}>
                      提交
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <div className="relative pl-8 space-y-8 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-100">
                {followUps.map((fu, idx) => (
                    <TimelineItem 
                        key={fu.id} 
                        title={`${METHOD_LABELS[fu.method] || fu.method} 跟进`} 
                        desc={fu.content} 
                        time={fu.followUpTime} 
                        icon={fu.method === 'visit' ? MapPin : User} 
                        isNewest={idx === 0} 
                        user={fu.createdBy}
                    />
                ))}
                <TimelineItem title="线索已归档录入" desc={`由专家 ${lead.creatorName} 发起初始评估`} time={lead.createdAt} icon={User} isNewest={followUps.length === 0} />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

const InfoItem = ({ label, value, icon }: { label: string, value: React.ReactNode, icon?: React.ReactNode }) => (
  <div className="space-y-1.5">
    <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest flex items-center gap-1.5">
      {icon && <span className="text-slate-400">{icon}</span>} {label}
    </label>
    <div className="text-sm font-bold text-slate-900">{value}</div>
  </div>
);

const METHOD_LABELS: Record<string, string> = {
    phone: '电话', wechat: '微信', face: '面谈', visit: '实勘'
};

const TimelineItem = ({ title, desc, time, icon: Icon, isNewest, user }: { title: string, desc: string, time: string, icon: React.ElementType, isNewest?: boolean, user?: string }) => (
  <div className="relative">
    <div className={cn("absolute -left-[31px] top-0 h-6 w-6 rounded-full border-4 border-white flex items-center justify-center shadow-sm", isNewest ? "bg-primary" : "bg-slate-200")}>
      <Icon className={cn("h-3 w-3", isNewest ? "text-white" : "text-slate-500")} />
    </div>
    <div className="flex flex-col">
      <div className="flex items-center gap-2">
         <span className="text-sm font-black text-slate-900">{title}</span>
         {user && <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 rounded text-slate-500 font-bold">{user}</span>}
      </div>
      <p className="text-xs text-slate-500 mt-1">{desc}</p>
      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">{time}</span>
    </div>
  </div>
);
