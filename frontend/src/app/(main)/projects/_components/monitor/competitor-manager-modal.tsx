"use client";

import React, { useState, useEffect, useCallback } from "react";
import { X, Loader2, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getCompetitorsAction,
  searchCommunitiesAction,
  addCompetitorAction,
  removeCompetitorAction,
  CompetitorItem,
} from "../../actions/monitor";

interface CommunitySearchItem {
  id: number;
  name: string;
}

interface CompetitorManagerModalProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export function CompetitorManagerModal({
  projectId,
  isOpen,
  onClose,
  onUpdate,
}: CompetitorManagerModalProps) {
  const [competitors, setCompetitors] = useState<CompetitorItem[]>([]);
  const [communityId, setCommunityId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CommunitySearchItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    if (value.length < 2) {
      setSearchResults([]);
    }
  };

  // 加载竞品列表
  useEffect(() => {
    if (!isOpen) return;
    
    let isMounted = true;
    const loadData = async () => {
      setIsLoading(true);
      const result = await getCompetitorsAction(projectId);
      if (isMounted && result.success && result.data) {
        setCompetitors(result.data);
        setCommunityId(result.communityId ?? null);
      }
      if (isMounted) setIsLoading(false);
    };
    
    loadData();
    
    return () => { isMounted = false; };
  }, [isOpen, projectId, refreshKey]);

  // 搜索小区
  useEffect(() => {
    if (searchQuery.length < 2) {
      return;
    }
    
    let isMounted = true;
    const timer = setTimeout(async () => {
      setIsSearching(true);
      const result = await searchCommunitiesAction(searchQuery);
      if (isMounted && result.success && result.data) {
        const existing = new Set(competitors.map((c) => c.community_id));
        existing.add(communityId ?? -1);
        setSearchResults(result.data.filter((c) => !existing.has(c.id)));
      }
      if (isMounted) setIsSearching(false);
    }, 300);
    
    return () => { isMounted = false; clearTimeout(timer); };
  }, [searchQuery, competitors, communityId]);

  // 添加竞品
  const handleAdd = useCallback(async (competitorId: number) => {
    if (!communityId) return;
    setIsAdding(true);
    const result = await addCompetitorAction(communityId, competitorId);
    if (result.success) {
      setSearchQuery("");
      setSearchResults([]);
      setRefreshKey((k) => k + 1);
      onUpdate();
    }
    setIsAdding(false);
  }, [communityId, onUpdate]);

  // 删除竞品
  const handleRemove = useCallback(async (competitorId: number) => {
    if (!communityId) return;
    setDeletingId(competitorId);
    const result = await removeCompetitorAction(communityId, competitorId);
    if (result.success) {
      setRefreshKey((k) => k + 1);
      onUpdate();
    }
    setDeletingId(null);
  }, [communityId, onUpdate]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <h3 className="font-bold text-slate-800">管理竞品小区</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
            <X size={18} className="text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* 搜索区域 */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1.5">添加竞品小区</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={handleSearchChange}
                placeholder="搜索小区名称 (至少2个字符)..."
                className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 ring-indigo-500/20 outline-none transition-all"
              />
              {isSearching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-slate-400" />
              )}
            </div>

            {/* 搜索结果 */}
            {searchResults.length > 0 && (
              <div className="mt-2 border border-slate-200 rounded-lg max-h-40 overflow-y-auto divide-y divide-slate-100">
                {searchResults.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => handleAdd(item.id)}
                    disabled={isAdding}
                    className="w-full px-3 py-2.5 text-left text-sm hover:bg-indigo-50 transition-colors flex justify-between items-center disabled:opacity-50"
                  >
                    <span className="text-slate-700">{item.name}</span>
                    <span className="text-xs text-indigo-600 font-medium">+ 添加</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 已添加的竞品列表 */}
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-2">
              当前竞品列表 ({competitors.length})
            </label>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : competitors.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-400 bg-slate-50 rounded-lg">
                暂未添加竞品小区
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100">
                {competitors.map((item) => (
                  <div key={item.community_id} className="px-4 py-3 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm text-slate-800">{item.community_name}</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        在售 {item.on_sale_count} 套 · 均价 ¥{item.avg_price?.toLocaleString() || "-"}/㎡
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(item.community_id)}
                      disabled={deletingId === item.community_id}
                      className="text-rose-500 hover:text-rose-600 hover:bg-rose-50 h-8 w-8 p-0"
                    >
                      {deletingId === item.community_id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50">
          <Button onClick={onClose} variant="outline" className="w-full">
            完成
          </Button>
        </div>
      </div>
    </div>
  );
}
