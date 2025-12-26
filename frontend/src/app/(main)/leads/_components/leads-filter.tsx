import React from 'react';
import { Search, MapPin, User, List, LayoutGrid } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { STATUS_CONFIG } from '../constants';
import { FilterState, LeadStatus } from '../types';

interface LeadsFilterProps {
  filters: FilterState;
  setFilters: React.Dispatch<React.SetStateAction<FilterState>>;
  viewMode: 'table' | 'grid';
  setViewMode: (mode: 'table' | 'grid') => void;
}

export const LeadsFilter: React.FC<LeadsFilterProps> = ({ filters, setFilters, viewMode, setViewMode }) => {
  const toggleFilter = <T extends string>(key: keyof FilterState, value: T) => {
    setFilters(prev => {
      const current = prev[key] as T[];
      const next = current.includes(value) ? current.filter(i => i !== value) : [...current, value];
      return { ...prev, [key]: next };
    });
  };

  const handleTextChange = (key: keyof FilterState, value: string) => {
      setFilters(prev => ({ ...prev, [key]: value }));
  };

  return (
    <Card className="border-none shadow-sm bg-white/70 backdrop-blur">
      <CardContent className="p-4 sm:p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search Inputs */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase text-muted-foreground ml-1">房源名称</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input 
                placeholder="搜索小区名..." 
                className="w-full h-10 pl-10 pr-4 bg-background border border-border rounded-lg text-sm focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                value={filters.search}
                onChange={(e) => handleTextChange('search', e.target.value)}
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
                onChange={(e) => handleTextChange('district', e.target.value)}
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
                onChange={(e) => handleTextChange('creator', e.target.value)}
              />
            </div>
          </div>
          
          {/* View Toggle */}
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

        {/* Categories/Tags */}
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
  );
};
