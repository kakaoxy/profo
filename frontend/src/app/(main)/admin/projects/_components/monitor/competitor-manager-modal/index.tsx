"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCompetitors } from "./use-competitors";
import { useCommunitySearch } from "./use-community-search";
import { SearchSection } from "./search-section";
import { CompetitorList } from "./competitor-list";

interface CompetitorManagerModalProps {
  projectId?: string;
  communityId?: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export function CompetitorManagerModal({
  projectId,
  communityId: initialCommunityId,
  isOpen,
  onClose,
  onUpdate,
}: CompetitorManagerModalProps) {
  const [isAdding, setIsAdding] = useState(false);

  const { competitors, communityId, loading, deletingId, addCompetitor, removeCompetitor } =
    useCompetitors({
      projectId,
      communityId: initialCommunityId,
      isOpen,
    });

  const { searchQuery, searchResults, isSearching, setSearchQuery } = useCommunitySearch({
    existingIds: competitors.map((c) => c.community_id),
    currentCommunityId: communityId,
  });

  const handleAdd = async (competitorId: string) => {
    setIsAdding(true);
    await addCompetitor(competitorId);
    setSearchQuery("");
    setIsAdding(false);
    onUpdate();
  };

  const handleRemove = async (competitorId: string) => {
    await removeCompetitor(competitorId);
    onUpdate();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-white/40 backdrop-blur-sm">
      <div className="w-full max-w-lg overflow-hidden rounded-cards border border-fog bg-white shadow-steep">
        {/* Header */}
        <div className="px-6 py-4 border-b border-fog flex items-center justify-between bg-fog">
          <h3 className="font-bold text-ink">管理竞品小区</h3>
          <button onClick={onClose} className="p-1 hover:bg-fog rounded-full transition-colors">
            <X size={18} className="text-graphite" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          <SearchSection
            searchQuery={searchQuery}
            searchResults={searchResults}
            isSearching={isSearching}
            isAdding={isAdding}
            onSearchChange={setSearchQuery}
            onAdd={handleAdd}
          />

          <div>
            <label className="block text-xs font-bold text-graphite mb-2">
              当前竞品列表 ({competitors.length})
            </label>
            <CompetitorList
              competitors={competitors}
              loading={loading}
              deletingId={deletingId}
              onRemove={handleRemove}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-fog bg-fog">
          <Button onClick={onClose} variant="outline" className="w-full">
            完成
          </Button>
        </div>
      </div>
    </div>
  );
}
