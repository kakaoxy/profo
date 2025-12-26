import React, { useState } from 'react';
import { Lead, LeadStatus } from '../../types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Ruler, Home, MapPin, ArrowRightLeft, Clock, User,
  Wallet, Target, Gavel, AlertTriangle, CheckCircle2, FileCheck
} from 'lucide-react';
import { MonitorCard } from './monitor-card';

interface Props {
  lead: Lead;
  onAudit: (leadId: string, status: LeadStatus, evalPrice?: number, reason?: string) => void;
  onViewMonitor: (lead: Lead) => void;
}

export const InfoTab: React.FC<Props> = ({ lead, onAudit, onViewMonitor }) => {
  const [auditReason, setAuditReason] = useState('');
  const [evalPrice, setEvalPrice] = useState<number | ''>('');

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Key House Params */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-none shadow-sm bg-white p-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Wallet className="h-3 w-3" /> 用户期望价
            </span>
            <div className="text-2xl font-black text-indigo-900">¥ {lead.totalPrice} <span className="text-xs font-bold text-slate-400 ml-1">万</span></div>
            <div className="text-[10px] text-slate-400 font-bold uppercase">{lead.unitPrice?.toFixed(2)} 万/㎡ · {lead.area}㎡</div>
          </div>
        </Card>
        <Card className="border-none shadow-sm bg-white p-4">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Target className="h-3 w-3" /> 专家评估建议
            </span>
            <div className="text-2xl font-black text-emerald-600">
              {lead.evalPrice ? `¥ ${lead.evalPrice}` : '--'} <span className="text-xs font-bold text-slate-400 ml-1">万</span>
            </div>
            <div className="text-[10px] text-emerald-500 font-bold uppercase">
              {lead.evalPrice ? `建议价 vs 报价: ${((lead.evalPrice / lead.totalPrice - 1) * 100).toFixed(1)}%` : '待评估'}
            </div>
          </div>
        </Card>
      </div>

      {/* House Config Details */}
      <div className="grid grid-cols-3 gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <DetailBadge icon={<Ruler className="h-3 w-3" />} label="面积" value={`${lead.area}㎡`} />
        <DetailBadge icon={<Home className="h-3 w-3" />} label="户型" value={lead.layout} />
        <DetailBadge icon={<MapPin className="h-3 w-3" />} label="商圈" value={`${lead.district} - ${lead.businessArea}`} />
        <DetailBadge icon={<ArrowRightLeft className="h-3 w-3" />} label="朝向" value={lead.orientation} />
        <DetailBadge icon={<Clock className="h-3 w-3" />} label="楼层" value={lead.floorInfo} />
        <DetailBadge icon={<User className="h-3 w-3" />} label="录入人" value={lead.creatorName} />
      </div>

      {/* Real-time Market Monitoring */}
      <MonitorCard lead={lead} onViewMonitor={onViewMonitor} />

      {/* Action Panels per Status */}
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b bg-slate-50 flex items-center gap-2">
          <Gavel className="h-4 w-4 text-slate-600" />
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-600">管理决策终端</span>
        </div>
        <div className="p-6 space-y-6">
          {lead.status === LeadStatus.PENDING_ASSESSMENT && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">拟收房评估价 (万)</label>
                  <input 
                    type="number" 
                    className="w-full h-11 px-4 border rounded-xl font-bold text-emerald-600 focus:ring-2 focus:ring-indigo-500/20"
                    placeholder="输入评估价..."
                    value={evalPrice}
                    onChange={(e) => setEvalPrice(Number(e.target.value))}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-1">评估意见摘要</label>
                  <input 
                    className="w-full h-11 px-4 border rounded-xl text-sm"
                    placeholder="如：溢价控制、户型优劣..."
                    value={auditReason}
                    onChange={(e) => setAuditReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Button 
                  className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold shadow-lg shadow-emerald-100"
                  onClick={() => onAudit(lead.id, LeadStatus.PENDING_VISIT, evalPrice || undefined, auditReason)}
                >
                  批准约看排期
                </Button>
                <Button 
                  variant="outline" 
                  className="h-12 rounded-xl border-slate-200 text-slate-500 hover:bg-slate-50 font-bold"
                  onClick={() => onAudit(lead.id, LeadStatus.REJECTED, undefined, auditReason)}
                >
                  评估不符-驳回
                </Button>
              </div>
            </div>
          )}

          {lead.status === LeadStatus.PENDING_VISIT && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl flex gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-amber-800">当前阶段：实勘核验</p>
                  <p className="text-[11px] text-amber-700 leading-relaxed">请协调实勘人员在 48 小时内完成上门，重点核实房屋漏水、结构改动及物业欠费情况。</p>
                </div>
              </div>
              <Button 
                className="w-full h-12 rounded-xl bg-indigo-600 hover:bg-indigo-700 font-bold shadow-lg"
                onClick={() => onAudit(lead.id, LeadStatus.VISITED)}
              >
                确认已完成现场实勘
              </Button>
            </div>
          )}

          {lead.status === LeadStatus.VISITED && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex gap-3">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-emerald-800">实勘通过 - 等待签约</p>
                  <p className="text-[11px] text-emerald-700 leading-relaxed">实勘报告已归档，数据模型显示该房源具备 Flip 价值。请发起最终商务谈判。</p>
                </div>
              </div>
              <Button 
                className="w-full h-12 rounded-xl bg-indigo-900 hover:bg-black font-bold shadow-xl flex items-center gap-2"
                onClick={() => onAudit(lead.id, LeadStatus.SIGNED)}
              >
                <FileCheck className="h-4 w-4" /> 确认合同签署并收房
              </Button>
            </div>
          )}

          {lead.status === LeadStatus.SIGNED && (
            <div className="text-center py-4">
              <div className="inline-flex h-12 w-12 rounded-full bg-emerald-100 text-emerald-600 items-center justify-center mb-3">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <h4 className="font-black text-slate-900">恭喜！已完成资产收储</h4>
              <p className="text-xs text-slate-500 mt-1">该房源已进入“工程翻新”阶段</p>
            </div>
          )}

          {lead.status === LeadStatus.REJECTED && (
            <div className="bg-slate-50 border p-4 rounded-xl">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">驳回原因</p>
              <p className="text-sm italic text-slate-600">&quot;{lead.auditReason || '未填写具体原因'}&quot;</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const DetailBadge = ({ label, value, icon }: { label: string, value: string, icon: React.ReactNode }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[9px] font-black text-slate-400 uppercase flex items-center gap-1">{icon} {label}</span>
    <span className="text-xs font-bold text-slate-900 truncate">{value}</span>
  </div>
);
