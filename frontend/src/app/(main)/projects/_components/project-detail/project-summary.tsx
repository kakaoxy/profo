"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Calendar, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Project } from "../../types";
import { getDaysUntil, getStatusColor } from "./utils";

interface ProjectSummaryProps {
  project: Project;
}

/**
 * 项目摘要组件 - 展示关键指标卡片
 */
export function ProjectSummary({ project }: ProjectSummaryProps) {
  const daysUntilHandover = getDaysUntil(project.planned_handover_date);

  return (
    <div className="grid grid-cols-3 gap-3 py-4">
      {/* 状态 */}
      <Card className="bg-muted/50">
        <CardContent className="p-3 text-center">
          <div
            className={cn(
              "w-3 h-3 rounded-full mx-auto mb-1",
              getStatusColor(project.status)
            )}
          />
          <p className="text-lg font-bold">{project.status}</p>
          <p className="text-xs text-muted-foreground">当前状态</p>
        </CardContent>
      </Card>

      {/* 签约价 */}
      <Card className="bg-muted/50">
        <CardContent className="p-3 text-center">
          <TrendingUp className="h-4 w-4 mx-auto mb-1 text-blue-500" />
          <p className="text-lg font-bold font-mono">
            {project.signing_price ? `${project.signing_price}万` : "-"}
          </p>
          <p className="text-xs text-muted-foreground">签约价</p>
        </CardContent>
      </Card>

      {/* 距交房天数 */}
      <Card className="bg-muted/50">
        <CardContent className="p-3 text-center">
          <Calendar className="h-4 w-4 mx-auto mb-1 text-orange-500" />
          <p
            className={cn(
              "text-lg font-bold",
              daysUntilHandover !== null &&
                daysUntilHandover < 0 &&
                "text-red-500",
              daysUntilHandover !== null &&
                daysUntilHandover >= 0 &&
                daysUntilHandover <= 7 &&
                "text-orange-500"
            )}
          >
            {daysUntilHandover !== null
              ? daysUntilHandover >= 0
                ? `${daysUntilHandover}天`
                : `超${Math.abs(daysUntilHandover)}天`
              : "-"}
          </p>
          <p className="text-xs text-muted-foreground">距交房</p>
        </CardContent>
      </Card>
    </div>
  );
}
