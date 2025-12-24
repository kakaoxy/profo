
"use client";

import { useEffect, useState } from "react";
import { Search, Filter, Loader2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCompetitorsBrawlAction, type BrawlItem } from "../../actions/monitor";

interface CompetitorsBrawlProps {
  projectId: string;
}

export function CompetitorsBrawl({ projectId }: CompetitorsBrawlProps) {
  const [activeTab, setActiveTab] = useState<'on_sale' | 'sold'>('on_sale');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<BrawlItem[]>([]);
  const [counts, setCounts] = useState({ on_sale: 0, sold: 0 });

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        // 调用 Server Action 根据 tab 获取数据
        const res = await getCompetitorsBrawlAction(projectId, activeTab);
        if (res.success && res.data) {
          setItems(res.data.items);
          // 更新 counts
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
  }, [projectId, activeTab]);

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
               onClick={() => setActiveTab('on_sale')}
               className={`${activeTab === 'on_sale' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'} border-none rounded-lg font-bold text-[11px] h-8 transition-colors`}
             >
               在售 ({counts.on_sale})
             </Button>
             <Button 
               variant="outline" 
               size="sm" 
               onClick={() => setActiveTab('sold')}
               className={`${activeTab === 'sold' ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'} border-none rounded-lg font-bold text-[11px] h-8 transition-colors`}
             >
               已售 ({counts.sold})
             </Button>
          </div>

          <div className="h-4 w-px bg-slate-200 mx-2" />

          {/* 这里的房间筛选目前是装饰性的，实际功能可根据需求添加 */}
          <div className="flex gap-1.5">
             {["1室", "2室", "3室", "4室+"].map((r, i) => (
                <button key={r} className={`px-3 py-1 text-[11px] font-bold rounded-full transition-all ${i === 1 ? 'bg-slate-800 text-white' : 'bg-slate-50 text-slate-400 hover:bg-slate-100'}`}>
                   {r}
                </button>
             ))}
          </div>

          <div className="flex-1 min-w-[200px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input 
              type="text" 
              placeholder="搜索 ID、商圈或小区名称..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border-none rounded-lg text-xs font-medium focus:ring-2 ring-indigo-500/10 outline-none transition-all"
            />
          </div>
        </div>

        {/* Comparison Table */}
        <Card className="border-slate-100 shadow-sm overflow-hidden bg-white min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-40 text-red-500">
               <AlertCircle className="h-6 w-6 mb-2" />
               <span className="text-sm">{error}</span>
            </div>
          ) : items.length === 0 ? (
             <div className="flex items-center justify-center h-40 text-slate-400 text-sm">
                暂无{activeTab === 'on_sale' ? '在售' : '成交'}数据
             </div>
          ) : (
            <Table className="min-w-[1000px]">
              <TableHeader className="bg-slate-50/50">
                <TableRow className="hover:bg-transparent border-b border-slate-100">
                  <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">房源 ID</TableHead>
                  <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">小区 / 状态</TableHead>
                  <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">户型 / 朝向</TableHead>
                  <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">面积 (㎡)</TableHead>
                  <TableHead className="py-4 px-4 text-[10px] font-bold text-rose-500 uppercase tracking-wider">总价 (万)</TableHead>
                  <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">单价 (元/㎡)</TableHead>
                  <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    {activeTab === 'on_sale' ? '挂牌日期' : '成交日期'}
                  </TableHead>
                  <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-50">
                {items.map((item) => (
                  <TableRow key={item.id} className={`${item.is_current ? "bg-indigo-50/40" : "hover:bg-slate-50"} transition-colors border-none`}>
                    <TableCell className="py-4 px-4 font-mono text-xs text-slate-400 font-bold">
                       {item.id.length > 10 ? `#${item.id.slice(0, 6)}...` : `#${item.id}`}
                    </TableCell>
                    <TableCell className="py-4 px-4 text-xs">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800">{item.community}</span>
                        <span className={`text-[10px] font-bold ${item.status === '在售' || item.status === '挂牌' ? 'text-amber-500' : 'text-emerald-500'}`}>
                          {item.status === '在售' || item.status === '挂牌' ? '● 正在挂牌' : '● 已成交'}
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
          )}
        </Card>
      </div>
    </section>
  );
}
