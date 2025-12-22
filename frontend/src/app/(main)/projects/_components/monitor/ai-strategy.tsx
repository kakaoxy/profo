"use client";

import { useState } from "react";
import { Sparkles, BrainCircuit, ShieldAlert, Loader2, AlertTriangle } from "lucide-react";
import { SectionHeader } from "./section-header";
import { Button } from "@/components/ui/button";
import ReactMarkdown from "react-markdown";

interface AIStrategyProps {
  projectId: string;
}

export function AIStrategy({ projectId }: AIStrategyProps) {
  // Use projectId to satisfy linter
  console.log(`AI Strategy for: ${projectId}`);

  const [input, setInput] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  const handleGenerate = () => {
    setIsGenerating(true);
    // Simulate AI generation
    setTimeout(() => {
      setReport(`
### 🤖 定价分析与决策建议

**1. 核心逻辑分析**
*   **成本端压制**：免租期仅剩15天，每日流出成本¥300。若未来30天不免租，利润将再度缩减¥9,000。
*   **竞品挤压**：周边同户型成交均价已跌至¥37,500/㎡，而本项目当前挂牌折合单价¥38,181/㎡，存在2.1%的行情偏离度。

**2. 调价策略建议**
*   **策略选择**：**降价跑量型**
*   **建议价格**：**¥205万** (即单价¥37,272/㎡)
*   **行动路线**：
    *   立即下调挂牌价至¥207万，并预留¥2万谈判空间。
    *   开启为期14天的“优选房源”渠道激励，佣金上浮0.5%。

**3. 风险对冲提醒**
*   若在剩余免租期内无法成交，建议考虑短暂转租以对冲持有成本。
      `);
      setIsGenerating(false);
    }, 2000);
  };

  return (
    <section className="mt-8 pb-32">
      <SectionHeader 
        index="5" 
        title="智能决策建议" 
        subtitle="AI Strategy" 
      />
      
      <div className="px-6 space-y-6">
        {/* Input & Action Header */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all focus-within:ring-2 ring-indigo-500/10">
          <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BrainCircuit className="text-indigo-500" size={18} />
              <span className="text-xs font-bold text-slate-700">AI 决策研判工作台</span>
            </div>
            {report && (
              <button 
                onClick={() => { setReport(null); setInput(''); }}
                className="text-[10px] font-bold text-slate-400 hover:text-rose-500 transition-colors"
              >
                清空会话
              </button>
            )}
          </div>
          
          <div className="p-4 space-y-4">
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="输入补充信息 (如：业主急售、房屋带名额、高标准精装等)..."
                className="w-full h-24 p-4 bg-slate-50 rounded-xl text-sm text-slate-600 placeholder:text-slate-400 border border-slate-100 focus:bg-white focus:border-indigo-300 outline-none transition-all resize-none"
              />
              <div className="absolute bottom-3 right-3 flex items-center gap-2">
                <Button 
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className={`flex items-center gap-2 px-6 py-2 rounded-full font-bold text-sm transition-all shadow-lg active:scale-95 disabled:opacity-50 h-auto ${
                    report ? 'bg-slate-800 text-white' : 'bg-indigo-600 text-white shadow-indigo-200'
                  }`}
                >
                  {isGenerating ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    report ? <Sparkles size={16} /> : <Sparkles size={16} />
                  )}
                  {isGenerating ? '研判中...' : (report ? '重新研判' : '立即生成专家建议')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Result Area */}
        {report && !isGenerating && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="lg:col-span-2 space-y-4">
              <div className="bg-white p-6 rounded-2xl border border-indigo-100 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                  <BrainCircuit size={120} />
                </div>
                <h3 className="text-slate-800 font-black flex items-center gap-2 mb-6 border-b border-slate-50 pb-3 uppercase tracking-tight">
                  <Sparkles className="text-amber-500" size={18} />
                  AI 定价专家研判报告
                </h3>
                <div className="prose prose-sm prose-slate max-w-none prose-headings:text-slate-900 prose-strong:text-indigo-700">
                   <ReactMarkdown>{report}</ReactMarkdown>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="bg-gradient-to-br from-indigo-50 to-white p-6 rounded-2xl border border-indigo-100 shadow-sm">
                <h3 className="text-indigo-800 font-bold mb-4 flex items-center gap-2 text-sm uppercase">
                  <ShieldAlert className="w-4 h-4" />
                  风控核心提醒
                </h3>
                <div className="space-y-3">
                  <div className="p-3 bg-white/60 rounded-lg border border-indigo-50">
                    <p className="text-[11px] text-slate-500 font-medium mb-1">利润临界点</p>
                    <p className="text-sm font-black text-slate-800">¥ 202.5 万</p>
                  </div>
                  <div className="p-3 bg-white/60 rounded-lg border border-indigo-50">
                    <p className="text-[11px] text-slate-500 font-medium mb-1">延期日损失</p>
                    <p className="text-sm font-black text-rose-600">¥ 300 / 天</p>
                  </div>
                </div>
                <Button className="w-full mt-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 h-auto">
                  <Sparkles size={14} className="fill-white" />
                  立即同步至挂牌系统
                </Button>
              </div>

              <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200">
                <h3 className="text-slate-700 font-bold mb-2 flex items-center gap-2 text-sm uppercase">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  备选对冲方案
                </h3>
                <p className="text-slate-500 text-[11px] leading-relaxed mb-6">
                  若不接受调价，建议立即增加 2000 元渠道激励金，以此提升在各平台成交排名优先级。
                </p>
                <Button variant="outline" className="w-full py-2.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-xl text-xs font-bold transition-all h-auto">
                  开启渠道激励
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Loading Placeholder */}
        {isGenerating && (
          <div className="p-20 flex flex-col items-center justify-center border border-slate-100 rounded-2xl bg-white/50 space-y-4">
            <div className="relative">
              <div className="w-20 h-20 border-4 border-indigo-100 border-t-indigo-500 rounded-full animate-spin"></div>
              <BrainCircuit className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-500" size={32} />
            </div>
            <div className="text-center">
              <p className="text-slate-700 font-bold">深度研判中...</p>
              <p className="text-slate-400 text-xs mt-1">AI 正在调取周边竞品成交曲线并计算持有折旧...</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
