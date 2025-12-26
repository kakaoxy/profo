"use client";

import React from 'react';
import { Lead } from '../types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Activity, Share2 } from 'lucide-react';

// Import from existing monitor components
import { HeroSection } from "../../projects/_components/monitor/hero-section";
import { MarketSentiment } from "../../projects/_components/monitor/market-sentiment";
import { NeighborhoodRadar } from "../../projects/_components/monitor/neighborhood-radar";
import { TrendPositioning } from "../../projects/_components/monitor/trend-positioning";
import { CompetitorsBrawl } from "../../projects/_components/monitor/competitors-brawl";
import { AIStrategy } from "../../projects/_components/monitor/ai-strategy";
import { ProjectData } from "../../projects/_components/monitor/types";

interface Props {
  lead: Lead;
  onClose: () => void;
}

const CardWrapper = ({ children }: { children: React.ReactNode }) => (
  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
    {children}
  </div>
);

export const MonitoringDashboard: React.FC<Props> = ({ lead, onClose }) => {
  // Construct ProjectData from Lead to override HeroSection fetching
  const overrideData: ProjectData = {
    address: lead.communityName,
    community_name: lead.communityName,
    area: lead.area,
    signing_price: lead.totalPrice, // Treating User Offer Price as main price
    list_price: lead.totalPrice,
    signing_date: lead.createdAt, // Use creation date as reference
    signing_period: 0, 
    extensionPeriod: 0, 
    extensionRent: 0, 
  };

  const myOverridePrice = lead.unitPrice && lead.unitPrice > 0 
    ? lead.unitPrice 
    : (lead.totalPrice && lead.area ? Math.round(lead.totalPrice * 10000 / lead.area) : 0);

  return (
    <div className="fixed inset-0 z-[60] bg-slate-50 flex flex-col animate-in fade-in zoom-in-95 duration-300">
      {/* Header */}
      <header className="h-16 border-b bg-white flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="h-8 w-[1px] bg-slate-200" />
          <div>
            <h1 className="text-lg font-black font-sans tracking-tight">{lead.communityName} · 监控看板</h1>
            <p className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest">Property Real-time Telemetry</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-100 font-bold">
            <Activity className="h-3 w-3 mr-1" /> 实时数据同步中
          </Badge>
          <Button variant="outline" size="sm" className="h-9 px-4 rounded-full">
            <Share2 className="h-4 w-4 mr-2" /> 导出报告
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-slate-100 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 font-sans">
            
            <CardWrapper>
              <HeroSection overrideData={overrideData} />
            </CardWrapper>

            <CardWrapper>
                <MarketSentiment communityName={lead.communityName} />
            </CardWrapper>
            
            <CardWrapper>
                <NeighborhoodRadar communityName={lead.communityName} />
            </CardWrapper>

            <CardWrapper>
              <TrendPositioning communityName={lead.communityName} myOverridePrice={myOverridePrice} />
            </CardWrapper>

            <CardWrapper>
              <CompetitorsBrawl communityName={lead.communityName} />
            </CardWrapper>

            <CardWrapper>
              <AIStrategy communityName={lead.communityName} />
            </CardWrapper>

        </div>
      </main>
    </div>
  );
};
