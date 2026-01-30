"use client";

import { MiniProject } from "../../types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock, RefreshCw } from "lucide-react";

interface PropertyHardInfoSectionProps {
  project: MiniProject;
  onRefresh: () => void;
}

export function PropertyHardInfoSection({
  project,
  onRefresh,
}: PropertyHardInfoSectionProps) {
  const items = [
    { label: "地址", value: project.address || "未同步" },
    { label: "总面积", value: project.area ? `${project.area} m²` : "未同步" },
    {
      label: "价格",
      value: project.price ? `¥${project.price.toLocaleString()} 万` : "未同步",
    },
    { label: "户型", value: project.layout || "未同步" },
    { label: "朝向", value: project.orientation || "未同步" },
    { label: "楼层信息", value: project.floor_info || "未同步" },
  ];

  return (
    <Card className="py-0 gap-0">
      <CardHeader className="border-b py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm">房源硬信息</CardTitle>
            <Badge variant="secondary">主项目同步</Badge>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw />
            刷新基础信息
          </Button>
        </div>
      </CardHeader>
      <CardContent className="py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {items.map((item) => (
            <div key={item.label} className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">
                {item.label}
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                <span className="truncate">{item.value}</span>
                <Lock className="size-4 opacity-50" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
