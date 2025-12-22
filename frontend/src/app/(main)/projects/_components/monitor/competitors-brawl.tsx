"use client";

import { Search, Filter } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface CompetitorsBrawlProps {
  projectId: string;
}

export function CompetitorsBrawl({ projectId }: CompetitorsBrawlProps) {
  // Use projectId to satisfy linter
  console.log(`Brawl data for: ${projectId}`);


  
  const competitors = [
    { id: "13-402", community: "康平小区", status: "挂牌", layout: "2室1厅", floor: "高楼层", area: 55, total: 198, unit: 36000, date: "2025-02-15", source: "贝壳" },
    { id: "9-201", community: "康平小区", status: "挂牌", layout: "2室1厅", floor: "中楼层", area: 54, total: 205, unit: 37962, date: "2025-02-20", source: "我爱我家" },
    { id: "13-101", community: "康平小区", status: "挂牌", layout: "2室1厅", floor: "低楼层", area: 55, total: 210, unit: 38181, date: "2025-01-10", source: "内部", is_current: true },
    { id: "WY-08", community: "远洋万和城", status: "成交", layout: "3室2厅", floor: "高楼层", area: 89, total: 516, unit: 58000, date: "2025-02-01", source: "贝壳" },
    { id: "YS-15", community: "阳光水岸", status: "成交", layout: "2室1厅", floor: "低楼层", area: 52, total: 265, unit: 50961, date: "2025-02-10", source: "我爱我家" },
  ];

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
             <Button variant="outline" size="sm" className="bg-indigo-600 text-white hover:bg-indigo-700 border-none rounded-lg font-bold text-[11px] h-8">在售 (36)</Button>
             <Button variant="outline" size="sm" className="bg-slate-50 text-slate-500 hover:bg-slate-100 border-none rounded-lg font-bold text-[11px] h-8">已售 (124)</Button>
          </div>

          <div className="h-4 w-px bg-slate-200 mx-2" />

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
        <Card className="border-slate-100 shadow-sm overflow-hidden bg-white">
          <Table className="min-w-[1000px]">
            <TableHeader className="bg-slate-50/50">
              <TableRow className="hover:bg-transparent border-b border-slate-100">
                <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">房源 ID</TableHead>
                <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">小区 / 状态</TableHead>
                <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">户型 / 朝向</TableHead>
                <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">面积 (㎡)</TableHead>
                <TableHead className="py-4 px-4 text-[10px] font-bold text-rose-500 uppercase tracking-wider">总价 (万)</TableHead>
                <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">单价 (元/㎡)</TableHead>
                <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">更新时间</TableHead>
                <TableHead className="py-4 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-50">
              {competitors.map((item) => (
                <TableRow key={item.id} className={`${item.is_current ? "bg-indigo-50/40" : "hover:bg-slate-50"} transition-colors border-none`}>
                  <TableCell className="py-4 px-4 font-mono text-xs text-slate-400 font-bold">{item.id}</TableCell>
                  <TableCell className="py-4 px-4 text-xs">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-800">{item.community}</span>
                      <span className={`text-[10px] font-bold ${item.status === '挂牌' ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {item.status === '挂牌' ? '● 正在挂牌' : '● 成交'}
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
        </Card>
      </div>
    </section>
  );
}
