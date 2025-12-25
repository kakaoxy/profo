"use client";

import React, { useState, useMemo, useEffect } from 'react';
import NextImage from 'next/image';
import { Lead, LeadStatus, FilterState, FollowUpMethod } from './types';
import { STATUS_CONFIG } from './constants';
import { createLeadAction, getLeadsAction, updateLeadAction, addFollowUpAction } from './actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LeadDrawer } from './_components/lead-drawer';
import { AddLeadModal } from './_components/add-lead-modal';
import { MonitoringDashboard } from './_components/monitoring-dashboard';
import { Search, Plus, List, RefreshCw, User, MapPin, ChevronRight, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    search: '',
    statuses: [],
    district: '',
    creator: '',
    layouts: [],
    floors: []
  });
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [monitoringLead, setMonitoringLead] = useState<Lead | null>(null);

  // Helpers
  const getFloorCategory = (floorInfo: string): string => {
    try {
      const match = floorInfo.match(/(\d+)\/(\d+)层/);
      if (!match) return '未知';
      const current = parseInt(match[1]);
      const total = parseInt(match[2]);
      const ratio = current / total;
      if (ratio <= 0.33) return '低';
      if (ratio <= 0.66) return '中';
      return '高';
    } catch { return '未知'; }
  };

  const getLayoutRooms = (layout: string): string => {
    const match = layout.match(/(\d+)室/);
    if (!match) return '其他';
    const rooms = parseInt(match[1]);
    return rooms >= 5 ? '4+' : rooms.toString();
  };

  // Fetch data on mount and when filters change (debouncing could be added)
  useEffect(() => {
    const fetchData = async () => {
        // Pass filters to backend. Note: frontend filters structure might need mapping if complex
        // For now, simpler implementation: Fetch top 100 and let backend filter what it can or use strict backend filtering
        // The action 'getLeadsAction' we wrote accepts 'filters' object.
        const data = await getLeadsAction(filters);
        setLeads(data);
    };
    // Debounce search
    const timer = setTimeout(fetchData, 300);
    return () => clearTimeout(timer);
  }, [filters]);

  const filteredLeads = useMemo(() => {
     // If backend handles filtering effectively, this client side filtering might be redundant 
     // BUT, getLeadsAction matches SOME filters (search, district). 
     // Others like 'creator' (name search) or 'floors' (range) might be tricky if backend doesn't support them fully yet.
     // For safety, we allow client-side refinement on the returned 100 items.
     return leads.filter(lead => {
      // Backend handles: search (community_name), status, district
      // Client handles residuals: creator, layouts, floors
      
      // const matchSearch = lead.communityName.toLowerCase().includes(filters.search.toLowerCase()); // Backend does this
      // const matchStatus = filters.statuses.length === 0 || filters.statuses.includes(lead.status); // Backend does this
      // const matchDistrict = !filters.district || lead.district.includes(filters.district); // Backend does this
      
      const matchCreator = !filters.creator || lead.creatorName.toLowerCase().includes(filters.creator.toLowerCase());
      const matchLayout = filters.layouts.length === 0 || filters.layouts.includes(getLayoutRooms(lead.layout));
      const matchFloor = filters.floors.length === 0 || filters.floors.includes(getFloorCategory(lead.floorInfo));
      return matchCreator && matchLayout && matchFloor;
    });
  }, [leads, filters]);

  const selectedLead = useMemo(() => leads.find(l => l.id === selectedLeadId) || null, [leads, selectedLeadId]);

  const toggleFilter = <T extends string>(key: keyof FilterState, value: T) => {
    setFilters(prev => {
      const current = prev[key] as T[];
      const next = current.includes(value) ? current.filter(i => i !== value) : [...current, value];
      return { ...prev, [key]: next };
    });
  };

  const handleOpenDetail = (id: string) => {
    setSelectedLeadId(id);
    setIsDrawerOpen(true);
  };

  const handleAudit = async (id: string, status: LeadStatus, evalPrice?: number, reason?: string) => {
    try {
        const updatedLead = await updateLeadAction(id, { status, evalPrice, reason });
        setLeads(prev => prev.map(l => l.id === id ? updatedLead : l));
        setIsDrawerOpen(false);
    } catch (e) {
        console.error("Failed to audit lead", e);
    }
  };

  const handleAddFollowUp = async (id: string, method: FollowUpMethod, content: string) => {
    try {
        await addFollowUpAction(id, method, content);
        // We might want to re-fetch the specific lead to get the updated followUp count or lastFollowUpAt
        // For now, simpler optimistic update or refetch list?
        // Let's just update the timestamp locally or re-fetch list for simplicity
        const updatedLeads = await getLeadsAction(filters);
        setLeads(updatedLeads);
    } catch (e) {
        console.error("Failed to add follow up", e);
    }
  };

  const handleAddLead = async (newLeadData: Omit<Lead, 'id' | 'createdAt'>) => {
    try {
        const newLead = await createLeadAction(newLeadData);
        setLeads(prev => [newLead as Lead, ...prev]);
    } catch (e) {
        console.error("Failed to add lead", e);
        // Toast error here ideally
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-col bg-slate-50/50">
      <div className="flex-1 space-y-4 p-4 sm:p-8 pt-6 container max-w-[1600px] mx-auto">
        {/* Page Heading */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-3xl font-black tracking-tight font-sans">线索中心</h2>
            <p className="text-muted-foreground">实时管理与评估房产线索流转状态</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setFilters({search: '', statuses: [], district: '', creator: '', layouts: [], floors: []})}>
              <RefreshCw className="mr-2 h-4 w-4" /> 重置筛选
            </Button>
            <Button size="sm" className="bg-primary shadow-md" onClick={() => setIsAddModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> 录入新线索
            </Button>
          </div>
        </div>

        {/* Filters Card */}
        <Card className="border-none shadow-sm bg-white/70 backdrop-blur">
          <CardContent className="p-4 sm:p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">房源名称</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input 
                    placeholder="搜索小区名..." 
                    className="w-full h-10 pl-10 pr-4 bg-background border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    value={filters.search}
                    onChange={(e) => setFilters(f => ({ ...f, search: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">区域范围</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input 
                    placeholder="搜索区县..." 
                    className="w-full h-10 pl-10 pr-4 bg-background border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    value={filters.district}
                    onChange={(e) => setFilters(f => ({ ...f, district: e.target.value }))}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">录入人</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <input 
                    placeholder="按创建人过滤..." 
                    className="w-full h-10 pl-10 pr-4 bg-background border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                    value={filters.creator}
                    onChange={(e) => setFilters(f => ({ ...f, creator: e.target.value }))}
                  />
                </div>
              </div>
              <div className="flex items-end gap-2">
                <div className="grid grid-cols-2 w-full h-10 bg-muted p-1 rounded-lg">
                  <button 
                    className={cn("flex items-center justify-center rounded-md text-sm font-medium transition-all", viewMode === 'table' ? "bg-background shadow-sm" : "text-muted-foreground")}
                    onClick={() => setViewMode('table')}
                  >
                    <List className="h-4 w-4 mr-2" /> Table
                  </button>
                  <button 
                    className={cn("flex items-center justify-center rounded-md text-sm font-medium transition-all", viewMode === 'grid' ? "bg-background shadow-sm" : "text-muted-foreground")}
                    onClick={() => setViewMode('grid')}
                  >
                    <LayoutGrid className="h-4 w-4 mr-2" /> Grid
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-6 pt-4 border-t">
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase text-muted-foreground ml-1">流程状态</span>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                    <button
                      key={key}
                      onClick={() => toggleFilter('statuses', key as LeadStatus)}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-xs font-semibold border transition-all",
                        filters.statuses.includes(key as LeadStatus) 
                          ? "bg-primary text-primary-foreground border-primary" 
                          : "bg-white text-muted-foreground hover:bg-slate-50 border-border"
                      )}
                    >
                      {config.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase text-muted-foreground ml-1">房源户型</span>
                <div className="flex gap-2">
                  {['1', '2', '3', '4', '4+'].map(l => (
                    <button
                      key={l}
                      onClick={() => toggleFilter('layouts', l)}
                      className={cn(
                        "w-10 h-8 rounded-md text-xs font-semibold border flex items-center justify-center transition-all",
                        filters.layouts.includes(l) 
                          ? "bg-primary text-primary-foreground border-primary" 
                          : "bg-white text-muted-foreground hover:bg-slate-50 border-border"
                      )}
                    >
                      {l}室
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <span className="text-[10px] font-bold uppercase text-muted-foreground ml-1">楼层高低</span>
                <div className="flex gap-2">
                  {['低', '中', '高'].map(f => (
                    <button
                      key={f}
                      onClick={() => toggleFilter('floors', f)}
                      className={cn(
                        "px-3 h-8 rounded-md text-xs font-semibold border flex items-center justify-center transition-all",
                        filters.floors.includes(f) 
                          ? "bg-primary text-primary-foreground border-primary" 
                          : "bg-white text-muted-foreground hover:bg-slate-50 border-border"
                      )}
                    >
                      {f}层
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Desktop Table View */}
        {viewMode === 'table' ? (
          <Card className="border-none shadow-sm overflow-hidden bg-white/80">
            <div className="w-full overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="bg-slate-50/50 border-b">
                  <tr className="text-left text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                    <th className="p-4 pl-8">小区基本面</th>
                    <th className="p-4">面积/户型</th>
                    <th className="p-4">价格详情</th>
                    <th className="p-4 text-center">状态</th>
                    <th className="p-4">最后跟进</th>
                    <th className="p-4 pr-8 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y text-sm">
                  {filteredLeads.map(lead => (
                    <tr key={lead.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="p-4 pl-8">
                        <div className="flex items-center gap-4">
                          <div className="h-12 w-16 overflow-hidden rounded-md bg-slate-100 border relative">
                            <NextImage src={lead.images[0]} className="object-cover transition-transform group-hover:scale-105" alt="prop" fill />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900 group-hover:text-primary">{lead.communityName}</span>
                            <span className="text-xs text-muted-foreground">{lead.district} · {lead.businessArea}</span>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="font-medium">{lead.layout}</span>
                          <span className="text-xs text-muted-foreground">{lead.area}㎡ · {lead.floorInfo}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-blue-600">¥{lead.totalPrice}万</span>
                          <span className="text-[10px] text-muted-foreground">{lead.unitPrice?.toFixed(2)}万/㎡</span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <Badge 
                          variant={
                            lead.status === LeadStatus.SIGNED ? "secondary" :
                            lead.status === LeadStatus.VISITED ? "default" : 
                            lead.status === LeadStatus.REJECTED ? "destructive" :
                            lead.status === LeadStatus.PENDING_VISIT ? "outline" : "default"
                          }
                          className={cn(
                            "font-bold",
                            lead.status === LeadStatus.SIGNED && "bg-indigo-100 text-indigo-700 border-indigo-200",
                            lead.status === LeadStatus.VISITED && "bg-emerald-100 text-emerald-700 border-emerald-200",
                            lead.status === LeadStatus.PENDING_VISIT && "bg-orange-100 text-orange-700 border-orange-200",
                            lead.status === LeadStatus.PENDING_ASSESSMENT && "bg-blue-100 text-blue-700 border-blue-200"
                          )}
                        >
                          {STATUS_CONFIG[lead.status]?.label}
                        </Badge>
                      </td>
                      <td className="p-4">
                        <div className="flex flex-col">
                          <span className="font-medium text-xs">{lead.creatorName}</span>
                          <span className="text-[10px] text-muted-foreground">{lead.lastFollowUpAt || lead.createdAt}</span>
                        </div>
                      </td>
                      <td className="p-4 pr-8 text-right">
                        <Button variant="ghost" size="sm" onClick={() => handleOpenDetail(lead.id)} className="h-8 w-8 p-0">
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ) : (
          /* Grid View */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredLeads.map(lead => (
              <Card key={lead.id} className="overflow-hidden border-none shadow-sm hover:shadow-md transition-all cursor-pointer group" onClick={() => handleOpenDetail(lead.id)}>
                <div className="relative aspect-video">
                  <NextImage src={lead.images[0]} className="object-cover transition-transform group-hover:scale-105" alt="lead" fill />
                  <div className="absolute top-3 left-3">
                    <Badge 
                      className={cn(
                        "font-bold border-none shadow-sm",
                        lead.status === LeadStatus.SIGNED && "bg-indigo-600 text-white"
                      )} 
                      variant={
                        lead.status === LeadStatus.SIGNED ? "secondary" :
                        lead.status === LeadStatus.VISITED ? "default" :
                        lead.status === LeadStatus.PENDING_ASSESSMENT ? "default" : "secondary"
                      }
                    >
                      {STATUS_CONFIG[lead.status]?.label}
                    </Badge>
                  </div>
                </div>
                <CardHeader className="p-4 pb-2">
                  <CardTitle className="text-base font-bold line-clamp-1">{lead.communityName}</CardTitle>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {lead.district} · {lead.businessArea}
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-2">
                  <div className="flex justify-between items-end">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">ASKING PRICE</span>
                      <span className="text-lg font-black text-primary">¥{lead.totalPrice}万</span>
                    </div>
                    <div className="text-right flex flex-col items-end">
                       <span className="text-xs font-bold">{lead.layout}</span>
                       <span className="text-[10px] text-muted-foreground">{lead.area}㎡ · {lead.floorInfo}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Overlays */}
      <LeadDrawer 
        lead={selectedLead} isOpen={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)}
        onAudit={handleAudit} 
        onAddFollowUp={handleAddFollowUp}
        onViewMonitor={(l) => {
          setMonitoringLead(l);
          setIsDrawerOpen(false);
        }}
      />
      
      {monitoringLead && (
        <MonitoringDashboard 
          lead={monitoringLead} 
          onClose={() => setMonitoringLead(null)} 
        />
      )}
      
      <AddLeadModal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} onAdd={handleAddLead} />
    </div>
  );
}
