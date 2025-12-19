"use client";

import { differenceInDays, parseISO, isValid } from "date-fns";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent } from "@/components/ui/card";
import { Project } from "../../../../types";

export function FinancialLifecycle({ project }: { project: Project }) {
  // [优化] 直接读取缓存字段
  const totalInvestment = Number(project.total_expense) || 0;
  const totalIncome = Number(project.total_income) || 0;

  // 资金回笼率 = (总回款 / 总投入) * 100
  const returnRate =
    totalInvestment > 0 ? (totalIncome / totalInvestment) * 100 : 0;

  // 优先使用后端返回的 soldPrice (Number 类型)，如果没有则尝试从字符串转换
  const soldPrice = Number(project.soldPrice) || 0;

  // 计算持有天数
  let daysHeld = 0;
  if (project.created_at && project.sold_at) {
    const start = parseISO(project.created_at as unknown as string);
    const end = parseISO(project.sold_at as unknown as string);
    if (isValid(start) && isValid(end)) {
      daysHeld = differenceInDays(end, start);
    }
  }

  return (
    <Card className="mt-6 shadow-sm border-slate-200">
      <CardContent className="p-0">
        <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-100 py-6">
          {/* Col 1: 合同价 */}
          <div className="px-6 flex flex-col gap-1">
            <span className="text-sm text-slate-500">合同成交价</span>
            <span className="text-2xl font-bold text-slate-900 font-mono">
              ¥{soldPrice.toLocaleString()}万
            </span>
            <span className="text-xs text-slate-400">
              挂牌价 ¥{Number(project.list_price || 0).toLocaleString()}万
            </span>
          </div>

          {/* Col 2: 累计回款 */}
          <div className="px-6 flex flex-col gap-1 pt-4 md:pt-0">
            <span className="text-sm text-slate-500">累计回款 (实收)</span>
            <span className="text-2xl font-bold text-emerald-600 font-mono">
              ¥{(totalIncome / 10000).toFixed(2)}万
            </span>
            <span className="text-xs text-emerald-600/60">
              资金回笼率 {returnRate.toFixed(0)}%
            </span>
          </div>

          {/* Col 3: 累计投入 */}
          <div className="px-6 flex flex-col gap-1 pt-4 md:pt-0">
            <span className="text-sm text-slate-500">累计投入 (实付)</span>
            <span className="text-2xl font-bold text-red-500 font-mono">
              ¥{(totalInvestment / 10000).toFixed(2)}万
            </span>
            <span className="text-xs text-slate-400">全周期总支出</span>
          </div>
        </div>

        <Separator />

        <div className="flex flex-col md:flex-row items-center justify-between p-6 gap-6 md:gap-0">
          <div className="flex items-center gap-2">
            <div className="h-8 w-1 bg-slate-900 rounded-full" />
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                Project Duration
              </p>
              <p className="text-sm font-medium text-slate-700">
                项目总周期{" "}
                <span className="text-slate-900 font-bold">{daysHeld}</span> 天
              </p>
            </div>
          </div>

          {/* 进度条可视化 (时间轴) */}
          <div className="flex-1 max-w-md w-full px-4">
            <div className="relative pt-1">
              <div className="overflow-hidden h-2 text-xs flex rounded bg-slate-100">
                <div
                  style={{ width: "100%" }}
                  className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-slate-300"
                ></div>
              </div>
              <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-mono">
                <span>SIGNING</span>
                <span>SOLD</span>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
