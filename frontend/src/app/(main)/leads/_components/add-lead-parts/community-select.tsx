import React, { useState, useEffect, useRef } from 'react';
import { Check, ChevronsUpDown, Building2, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { searchCommunitiesAction } from '../../actions';

interface Community {
  id: number;
  name: string;
  district?: string;
  business_circle?: string;
}

interface Props {
  value: string;
  onChange: (value: string, district?: string, businessArea?: string) => void;
}

export const CommunitySelect: React.FC<Props> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Community[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout>(null);

  useEffect(() => {
    if (!open) return;
    
    // Initial fetch if empty
    if (!query) {
        setResults([]);
        return;
    }

    setLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchCommunitiesAction(query);
        setResults(data);
      } catch (err) {
        console.error(err);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open]);

  const handleSelect = (community: Community) => {
    onChange(community.name, community.district, community.business_circle);
    setOpen(false);
    setQuery('');
  };

  const handleCreateNew = () => {
    if (!query) return;
    onChange(query);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">房源名称 <span className="text-red-500">*</span></label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full h-12 justify-between rounded-xl px-4 text-left font-medium border-slate-200 hover:bg-slate-50 hover:text-slate-900"
          >
            <div className="flex items-center gap-2 truncate">
                <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                <span className={cn("truncate", !value && "text-slate-400 font-normal")}>
                    {value || "输入小区搜索..."}
                </span>
            </div>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0 rounded-xl" align="start">
            <div className="p-2 border-b">
                <input 
                    className="w-full px-3 py-2 text-sm bg-slate-50 border rounded-lg outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="输入关键词搜索..."
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                />
            </div>
            <div className="max-h-[300px] overflow-y-auto p-1">
                {loading && (
                    <div className="flex items-center justify-center py-6 text-slate-400">
                        <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        <span className="text-xs">搜索中...</span>
                    </div>
                )}
                
                {!loading && results.length === 0 && query && (
                    <div className="p-1">
                        <button 
                            className="w-full flex items-center gap-2 p-3 text-sm text-primary bg-primary/5 hover:bg-primary/10 rounded-lg transition-colors font-bold"
                            onClick={handleCreateNew}
                        >
                            <Plus className="h-4 w-4" />
                            <span>使用新名称 &quot;{query}&quot;</span>
                        </button>
                    </div>
                )}

                {!loading && results.map((community) => (
                    <button
                        key={community.id}
                        className={cn(
                            "w-full flex items-center justify-between p-3 text-sm rounded-lg hover:bg-slate-100 transition-colors group text-left",
                            value === community.name && "bg-slate-50 text-primary font-bold"
                        )}
                        onClick={() => handleSelect(community)}
                    >
                        <div className="flex flex-col gap-0.5">
                            <span className="font-bold text-slate-900">{community.name}</span>
                            <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                {community.district} {community.business_circle && `· ${community.business_circle}`}
                            </span>
                        </div>
                        {value === community.name && <Check className="h-4 w-4" />}
                    </button>
                ))}
                
                {!loading && !query && results.length === 0 && (
                     <div className="py-8 text-center text-slate-400 text-xs">
                        请输入关键词查找小区
                     </div>
                )}
            </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
