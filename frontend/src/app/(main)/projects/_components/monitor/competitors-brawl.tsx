
"use client";

import { useEffect, useState } from "react";
import { Search, Filter, Loader2, AlertCircle, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCompetitorsBrawlAction, getCompetitorsBrawlByCommunityAction, type BrawlItem } from "../../actions/monitor";

interface CompetitorsBrawlProps {
  projectId?: string;
  communityName?: string;
}

type SortConfig = {
  key: 'total' | 'unit' | null;
  direction: 'asc' | 'desc' | null;
};

export function CompetitorsBrawl({ projectId, communityName }: CompetitorsBrawlProps) {
  const [statusFilters, setStatusFilters] = useState<('on_sale' | 'sold')[]>(['on_sale']);
  const [layoutFilters, setLayoutFilters] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, direction: null });
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allItems, setAllItems] = useState<BrawlItem[]>([]);
  const [counts, setCounts] = useState({ on_sale: 0, sold: 0 });

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let res: any;

        if (projectId) {
          res = await getCompetitorsBrawlAction(projectId);
        } else if (communityName) {
           res = await getCompetitorsBrawlByCommunityAction(communityName);
        } else {
           setLoading(false);
           return;
        }

        if (res.success && res.data) {
          setAllItems(res.data.items);
          setCounts(res.data.counts);
        } else {
          setError(res.message || "获取竞品列表失败");
        }
      } catch (e) {
        console.error(e);
        setError("加载失败");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [projectId, communityName]);

  // 辅助函数：解析户型中的室数
  const getRoomCount = (layoutStr: string): number => {
    // 假设格式为 "2室1厅", 取第一个数字
    const match = layoutStr.match(/^(\d+)室/);
    return match ? parseInt(match[1], 10) : 0;
  };

  // 前端过滤
  const filteredItems = allItems.filter(item => {
    // 1. 状态筛选
    let matchStatus = false;
    if (statusFilters.includes('on_sale') && item.status === 'on_sale') matchStatus = true;
    if (statusFilters.includes('sold') && item.status === 'sold') matchStatus = true;
    if (!matchStatus) return false;

    // 2. 户型筛选 (如果未选择任何户型，则不过滤)
    if (layoutFilters.length > 0) {
      const roomCount = getRoomCount(item.layout);
      const matchLayout = layoutFilters.some(filter => {
        if (filter === "4室+") {
          return roomCount >= 4;
        }
        // 提取 "1室" -> 1
        const filterCount = parseInt(filter, 10);
        return roomCount === filterCount;
      });
      if (!matchLayout) return false;
    }

    // 3. 搜索筛选 (目前仅支持小区名模糊搜索)
    if (searchQuery) {
      if (!item.community.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
    }

    return true;
  });

  // 排序逻辑
  if (sortConfig.key && sortConfig.direction) {
    filteredItems.sort((a, b) => {
      // 始终优先显示 is_current
      if (a.is_current && !b.is_current) return -1;
      if (!a.is_current && b.is_current) return 1;

      const valA = a[sortConfig.key!];
      const valB = b[sortConfig.key!];

      if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const toggleFilter = (status: 'on_sale' | 'sold') => {
    setStatusFilters(prev => {
      if (prev.includes(status)) {
        // 如果只剩这一个，就不允许取消 (至少保留一个)
        if (prev.length === 1) return prev;
        return prev.filter(s => s !== status);
      } else {
        return [...prev, status];
      }
    });
  };

  const toggleLayoutFilter = (layout: string) => {
    setLayoutFilters(prev => {
      if (prev.includes(layout)) {
        return prev.filter(l => l !== layout);
      } else {
        return [...prev, layout];
      }
    });
  };

  const handleSort = (key: 'total' | 'unit') => {
    setSortConfig(current => {
      if (current.key === key) {
        if (current.direction === 'asc') return { key, direction: 'desc' };
        if (current.direction === 'desc') return { key: null, direction: null }; 
        return { key, direction: 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const SortIcon = ({ column }: { column: 'total' | 'unit' }) => {
    if (sortConfig.key !== column) return <ArrowUpDown className="ml-1 h-3 w-3 text-slate-300" />;
    if (sortConfig.direction === 'asc') return <ArrowUp className="ml-1 h-3 w-3 text-indigo-600" />;
    return <ArrowDown className="ml-1 h-3 w-3 text-indigo-600" />;
  };

  return (
    <section className="mt-8 pb-10">
      <SectionHeader 
        index="4" 
        title="竞品肉搏战 (明细对比)" 
        subtitle="Direct Competitors Brawl" 
      />
      
      <div className="px-6 space-y-4">
        {/* Filter Bar */}
        <div className="flex flex-wrap items-center gap-4 bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
          <div className="flex items-center gap-2 pr-4 border-r border-slate-100">
             <Filter size={16} className="text-slate-400" />
             <span className="text-xs font-bold text-slate-500 uppercase">筛选项目</span>
          </div>

          <div className="flex gap-2">
             <Button 
               variant="outline" 
               size="sm" 
               onClick={() => toggleFilter('on_sale')}
               className={`${statusFilters.includes('on_sale') ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'} border-none rounded-lg font-bold text-[11px] h-8 transition-colors`}
             >
               在售 ({counts.on_sale})
             </Button>
             <Button 
               variant="outline" 
               size="sm" 
               onClick={() => toggleFilter('sold')}
               className={`${statusFilters.includes('sold') ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'} border-none rounded-lg font-bold text-[11px] h-8 transition-colors`}
             >
               已售 ({counts.sold})
             </Button>
          </div>

          <div className="h-4 w-px bg-slate-200 mx-2" />

          {/* 户型筛选 */}
          <div className="flex gap-1.5">
             {["1室", "2室", "3室", "4室+"].map((r) => (
                <button 
                  key={r} 
                  onClick={() => toggleLayoutFilter(r)}
                  className={`px-3 py-1 text-[11px] font-bold rounded-full transition-all ${
                    layoutFilters.includes(r) 
                      ? 'bg-slate-800 text-white' 
                      : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                  }`}
                >
                   {r}
                </button>
             ))}
          </div>

          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="搜索小区名称..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-lg text-xs font-medium focus:ring-2 ring-indigo-500/10 outline-none transition-all"
            />
          </div>
        </div>

        {/* Comparison Table */}
        <Card className="border-slate-100 shadow-sm overflow-x-auto bg-white min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-40 text-red-500">
               <AlertCircle className="h-6 w-6 mb-2" />
               <span className="text-sm">{error}</span>
            </div>
          ) : filteredItems.length === 0 ? (
             <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
                暂无数据
             </div>
          ) : (
            <>
              {/* Mobile Card Layout */}
              <div className="sm:hidden divide-y divide-slate-100">
                {filteredItems.map((item) => (
                  <div 
                    key={item.id} 
                    className={`p-4 ${item.is_current ? "bg-indigo-50/40" : ""}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <span className="text-sm font-bold text-slate-800">{item.community}</span>
                        <span className={`ml-2 text-[10px] font-bold ${item.status === 'on_sale' ? 'text-amber-500' : 'text-emerald-500'}`}>
                          ● {item.display_status || (item.status === 'on_sale' ? '在售' : '已成交')}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">{item.date}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-600 mb-2">
                      <span>{item.layout}</span>
                      <span className="text-slate-300">|</span>
                      <span>{item.floor}</span>
                      <span className="text-slate-300">|</span>
                      <span>{item.area}㎡</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="text-lg font-black text-rose-600">¥{item.total}万</span>
                        <span className="ml-2 text-xs text-slate-400">¥{item.unit.toLocaleString()}/㎡</span>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 text-xs text-indigo-600">
                        详情
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table Layout */}
              <div className="hidden sm:block overflow-x-auto scrollbar-hide">
                <Table className="min-w-[1000px]">
                  <TableHeader className="bg-slate-50/50">
                    <TableRow className="hover:bg-transparent border-b border-slate-100">
                      <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">房源 ID</TableHead>
                      <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">小区 / 状态</TableHead>
                      <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">户型 / 朝向</TableHead>
                      <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">面积 (㎡)</TableHead>
                      <TableHead className="py-4 px-4 text-[10px] font-bold text-rose-500 uppercase tracking-wider cursor-pointer select-none hover:bg-slate-100 transition-colors" onClick={() => handleSort('total')}>
                        <div className="flex items-center">
                          总价 (万)
                          <SortIcon column="total" />
                        </div>
                      </TableHead>
                      <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer select-none hover:bg-slate-100 transition-colors" onClick={() => handleSort('unit')}>
                        <div className="flex items-center">
                          单价 (元/㎡)
                          <SortIcon column="unit" />
                        </div>
                      </TableHead>
                      <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        挂牌/成交日期
                      </TableHead>
                      <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-50">
                    {filteredItems.map((item) => (
                      <TableRow key={item.id} className={`${item.is_current ? "bg-indigo-50/40" : "hover:bg-slate-50"} transition-colors border-none`}>
                        <TableCell className="py-4 px-4 font-mono text-xs text-slate-400 font-bold">
                           {item.id.length > 10 ? `#${item.id.slice(0, 6)}...` : `#${item.id}`}
                        </TableCell>
                        <TableCell className="py-4 px-4 text-xs">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-800">{item.community}</span>
                            <span className={`text-[10px] font-bold ${item.status === 'on_sale' ? 'text-amber-500' : 'text-emerald-500'}`}>
                              ● {item.display_status || (item.status === 'on_sale' ? '在售' : '已成交')}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="py-4 px-4 text-xs font-bold text-slate-600">
                          {item.layout} · {item.floor}
                        </TableCell>
                        <TableCell className="py-4 px-4 text-xs font-black text-slate-800">{item.area}</TableCell>
                        <TableCell className="py-4 px-4 text-sm font-black text-rose-600">¥ {item.total}</TableCell>
                        <TableCell className="py-4 px-4 text-xs font-bold text-slate-500">¥ {item.unit.toLocaleString()}</TableCell>
                        <TableCell className="py-4 px-4 text-[10px] text-slate-400 font-medium font-mono">
                          {item.date}
                        </TableCell>
                        <TableCell className="py-4 px-4 text-right">
                          <Button variant="ghost" size="sm" className="h-8 rounded-lg hover:bg-slate-100 text-[10px] font-bold text-indigo-600">
                            查看详情
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </Card>
      </div>
    </section>
  );
}
