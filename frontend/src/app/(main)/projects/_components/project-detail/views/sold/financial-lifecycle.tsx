"use client";

import { useState } from "react";
import { differenceInDays, parseISO, isValid, format } from "date-fns";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Project } from "../../../../types";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function FinancialLifecycle({ project }: { project: Project }) {
  // [优化] 直接读取缓存字段
  const totalInvestment = Number(project.total_expense) || 0;
  const totalIncome = Number(project.total_income) || 0;
  const listPrice = Number(project.list_price || 0);
  const soldPrice = Number(project.sold_price || 0);

  // 使用 state 存储 today，避免 SSR 和客户端时间不一致导致的 hydration 错误
  const [today] = useState<Date | null>(() => new Date());

  // 计算关键日期
  // 逻辑与 cashflow 保持一致：开工取签约日期或创建日期，售出取成交日期或今天
  const rawStartDate = project.signing_date || project.created_at;
  const signingDate = rawStartDate ? parseISO(rawStartDate) : null;

  const rawHandoverDate = project.planned_handover_date;
  const handoverDate = rawHandoverDate ? parseISO(rawHandoverDate) : null;

  // 使用真实上架日期，不再硬编码 +65 天
  const listingDate = project.listing_date ? parseISO(project.listing_date) : null;

  const rawSoldDate = project.sold_at || project.sold_date;
  const soldDate = rawSoldDate ? parseISO(rawSoldDate) : null;

  // 计算资金占用周期
  let occupationDays = 0;
  if (signingDate && isValid(signingDate)) {
    // 如果已售取成交日期，未售取今天
    const end = (soldDate && isValid(soldDate)) ? soldDate : (today || new Date());
    // 统一逻辑：差值天数，保底 0
    occupationDays = Math.max(0, differenceInDays(end, signingDate));
  }

  const formatNodeDate = (date: Date | null) => (date && isValid(date) ? format(date, "MM/dd") : "--/--");

  const steps = [
    { label: "签约", date: signingDate },
    { label: "开工", date: handoverDate },
    { label: "上架", date: listingDate },
    { label: "售出", date: soldDate },
  ];

  return (
    <Card className="mt-6 shadow-sm border-border overflow-hidden">
      <CardContent className="p-0">
        {/* 上半部分：资金构成 */}
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border py-6">
          {/* Col 1: 成交总价 */}
          <div className="px-8 flex flex-col justify-center">
            <span className="text-sm text-muted-foreground mb-1">成交总价</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-foreground font-mono">
                ¥{soldPrice.toFixed(1)}
              </span>
              <span className="text-sm font-bold text-foreground">万</span>
            </div>
            <span className="text-xs text-muted-foreground mt-1">
              挂牌 ¥{listPrice.toFixed(1)}万
            </span>
          </div>

          {/* Col 2: 累计回款 */}
          <div className="px-8 flex flex-col justify-center">
            <span className="text-sm text-muted-foreground mb-1">累计回款 (实收)</span>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-error font-mono">
                ¥{(totalIncome / 10000).toFixed(1)}
              </span>
              <span className="text-sm font-bold text-error">万</span>
            </div>
            <span className="text-xs text-error/60 mt-1 font-medium">
              款项已全部结清
            </span>
          </div>

          {/* Col 3: 累计投入 */}
          <TooltipProvider>
            <div className="px-8 flex flex-col justify-center">
              <span className="text-sm text-muted-foreground mb-1">累计投入 (实付)</span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-baseline gap-1 cursor-help">
                    <span className="text-2xl font-bold text-error font-mono">
                      ¥{(totalInvestment / 10000).toFixed(1)}
                    </span>
                    <span className="text-sm font-bold text-error">万</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>含收房、装修、持有成本等全周期支出</p>
                </TooltipContent>
              </Tooltip>
              <span className="text-xs text-muted-foreground mt-1">
                包含所有财务支出明细
              </span>
            </div>
          </TooltipProvider>
        </div>

        <Separator />

        {/* 下半部分：全周期时间轴 */}
        <div className="flex flex-col md:flex-row items-center justify-between py-8 px-8 gap-8">
          {/* 可视化组件 (Stepper) */}
          <div className="flex-1 w-full max-w-2xl relative">
            <div className="flex items-center justify-between relative">
              {/* 背景线 */}
              <div className="absolute top-1/2 left-0 w-full h-0.5 bg-muted -translate-y-1/2 z-0" />
              
              {steps.map((step, idx) => (
                <div key={idx} className="relative z-10 flex flex-col items-center gap-2 bg-card px-2">
                  <span className="text-[10px] font-mono font-medium text-muted-foreground">
                    {formatNodeDate(step.date)}
                  </span>
                  <div className={`h-3 w-3 rounded-full border-2 ${step.date ? 'bg-card border-primary' : 'bg-card border-border'}`} />
                  <span className="text-xs font-bold text-muted-foreground">
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 关键指标 (右侧) */}
          <div className="flex flex-col items-end border-l border-border pl-8 md:min-w-[140px]">
            <span className="text-xs text-muted-foreground font-medium mb-1">资金占用周期</span>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-mono font-bold text-foreground">
                {occupationDays}
              </span>
              <span className="text-sm font-bold text-muted-foreground">天</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
