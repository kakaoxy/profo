"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { Project } from "../../types";
import { getDaysUntil } from "./utils";

interface ProjectSummaryProps {
  project: Project;
}

/**
 * 项目摘要组件 - 展示关键指标卡片
 */
export function ProjectSummary({ project }: ProjectSummaryProps) {
  const daysUntilHandover = getDaysUntil(project.planned_handover_date);
  const netCashFlow = (project.net_cash_flow || 0) / 10000;
  const isProfitable = netCashFlow >= 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {/* 签约价 */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground font-medium mb-1">签约总价</p>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold font-mono tracking-tight">
              {project.signing_price ? project.signing_price.toLocaleString() : "-"}
            </span>
            <span className="text-xs text-muted-foreground">万</span>
          </div>
        </CardContent>
      </Card>

      {/* 现金流 */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground font-medium mb-1">净现金流</p>
          <div className={cn("flex items-baseline gap-1", isProfitable ? "text-red-600" : "text-green-600")}>
            <span className="text-2xl font-bold font-mono tracking-tight">
              {project.net_cash_flow !== undefined ? (isProfitable ? "+" : "") + netCashFlow.toLocaleString() : "-"}
            </span>
            <span className="text-xs text-muted-foreground">万</span>
          </div>
        </CardContent>
      </Card>

      {/* 距交房 */}
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground font-medium mb-1">距交房</p>
          <div className="flex items-baseline gap-1">
            <span
              className={cn(
                "text-2xl font-bold font-mono tracking-tight",
                daysUntilHandover !== null && daysUntilHandover < 0 && "text-red-500",
                daysUntilHandover !== null && daysUntilHandover >= 0 && daysUntilHandover <= 7 ? "text-orange-500" : "text-foreground"
              )}
            >
              {daysUntilHandover !== null ? Math.abs(daysUntilHandover) : "-"}
            </span>
            <span className="text-xs text-muted-foreground">
              {daysUntilHandover !== null ? (daysUntilHandover >= 0 ? "天" : "天 (已超时)") : ""}
            </span>
          </div>
        </CardContent>
      </Card>

       {/* 当前状态 - 只有这个卡片有背景色区分 */}
       <Card className={cn("border-l-4", 
          project.status === "签约中" && "border-l-blue-500",
          project.status === "装修中" && "border-l-orange-500",
          project.status === "在售" && "border-l-green-500",
          project.status === "已成交" && "border-l-purple-500"
       )}>
        <CardContent className="p-4 flex flex-col justify-center h-full">
          <div className="flex items-center justify-between">
             <span className="text-xs text-muted-foreground font-medium">当前阶段</span>
             <Calendar className="h-4 w-4 text-muted-foreground opacity-50"/>
          </div>
          <div className="mt-1">
             <span className="text-lg font-bold">{project.status}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
