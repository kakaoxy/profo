import React, { useState } from "react";
import { Plus, X, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { SectionHeader } from "./section-header";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface NeighborhoodRadarProps {
  projectId: string;
}

export function NeighborhoodRadar({ projectId }: NeighborhoodRadarProps) {
  // Use projectId to satisfy linter
  console.log(`Radar data for: ${projectId}`);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Mock data for Module 2
  const competitors = [
    { id: '1', name: "远洋万和城", listing_count: 45, beike: 22, iaij: 23, listing_avg: 62000, deal_count: 8, sold_beike: 5, sold_iaij: 3, deal_avg: 58000, spread: "高于本案 6.4%", spreadStatus: "favorable" },
    { id: '2', name: "阳光水岸", listing_count: 68, beike: 30, iaij: 38, listing_avg: 53000, deal_count: 15, sold_beike: 10, sold_iaij: 5, deal_avg: 51000, spread: "低于本案 6.5%", spreadStatus: "danger" },
    { id: '3', name: "康平小区 (本案)", listing_count: 12, beike: 6, iaij: 6, listing_avg: 56000, deal_count: 4, sold_beike: 2, sold_iaij: 2, deal_avg: 54500, spread: "[ 📍 当前位置 ]", spreadStatus: "warning" },
  ];

  return (
    <section className="mt-8 pb-10 relative">
      <SectionHeader 
        index="2" 
        title="周边竞品雷达" 
        subtitle="Neighborhood Radar" 
        action={
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setIsModalOpen(true)}
            className="bg-white text-blue-600 border-blue-200 hover:bg-blue-50 gap-1.5 shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            管理竞品小区
          </Button>
        }
      />
      
      <div className="px-6">
        <Card className="border-slate-100 shadow-sm overflow-hidden bg-white">
          <Table className="min-w-[800px]">
            <TableHeader className="bg-slate-50/50">
              <TableRow className="hover:bg-transparent border-b border-slate-100">
                <TableHead className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">小区名称</TableHead>
                <TableHead className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">挂牌套数 (渠道)</TableHead>
                <TableHead className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">挂牌均价</TableHead>
                <TableHead className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider">成交套数 (渠道)</TableHead>
                <TableHead className="py-3 px-4 text-[10px] font-bold text-slate-400 uppercase tracking-wider text-right">成交均价</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-slate-50">
              {competitors.map((item) => (
                <TableRow key={item.id} className={`${item.name.includes("本案") ? "bg-indigo-50/40" : "hover:bg-slate-50"} transition-colors border-none`}>
                  <TableCell className="py-4 px-4">
                    <span className="text-sm font-bold text-slate-800">{item.name}</span>
                  </TableCell>
                  <TableCell className="py-4 px-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900">{item.listing_count} 套</span>
                      <span className="text-[10px] text-slate-400 font-medium">贝壳:{item.beike} | 我爱:{item.iaij}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 px-4">
                    <span className="text-sm font-bold text-indigo-600">¥ {item.listing_avg.toLocaleString()} /㎡</span>
                  </TableCell>
                  <TableCell className="py-4 px-4">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-900">{item.deal_count} 套</span>
                      <span className="text-[10px] text-slate-400 font-medium">贝壳:{item.sold_beike} | 我爱:{item.sold_iaij}</span>
                    </div>
                  </TableCell>
                  <TableCell className="py-4 px-4 text-right">
                    <div className="flex flex-col items-end">
                      <span className="text-sm font-bold text-emerald-600">¥ {item.deal_avg.toLocaleString()} /㎡</span>
                      <span className={`text-[10px] font-bold mt-0.5 ${
                        item.spreadStatus === 'danger' ? 'text-rose-500' : 
                        item.spreadStatus === 'favorable' ? 'text-blue-500' : 'text-slate-400'
                      }`}>
                        {item.spreadStatus === 'favorable' ? `🔵 ${item.spread}` : item.spreadStatus === 'danger' ? `🔴 ${item.spread}` : item.spread}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>

      {/* Add Competitor Modal Placeholder */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="font-bold text-slate-800">管理竞品小区</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 hover:bg-slate-200 rounded-full transition-colors">
                <X size={18} className="text-slate-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1.5">小区名称 (从数据库检索)</label>
                <div className="relative">
                  <input 
                    type="text" 
                    placeholder="搜索并选择竞品小区..."
                    className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 ring-indigo-500/20 outline-none transition-all"
                  />
                </div>
                <p className="mt-2 text-[10px] text-slate-400">
                  * 系统将自动从贝壳、我爱我家等渠道同步该小区的挂牌及成交数据
                </p>
              </div>
              <div className="pt-4">
                <Button 
                  onClick={() => {
                    setIsAdding(true);
                    setTimeout(() => { setIsAdding(false); setIsModalOpen(false); }, 1500);
                  }}
                  disabled={isAdding}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-100 transition-all active:scale-[0.98] h-auto flex gap-2"
                >
                  {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {isAdding ? '正在同步数据...' : '确认添加并同步数据'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
