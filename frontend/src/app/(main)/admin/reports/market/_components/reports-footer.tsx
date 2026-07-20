/**
 * 商圈分析报表页脚（Server Component）。
 *
 * 渲染版本号、数据源说明与最近更新时间。Separator 充当顶部视觉分隔线。
 */
import type { ReactElement } from "react";
import { Separator } from "@/components/ui/separator";

interface ReportsFooterProps {
  lastUpdated: string;
}

export function ReportsFooter({ lastUpdated }: ReportsFooterProps): ReactElement {
  return (
    <footer className="py-6">
      <Separator className="mb-4" />
      <p className="text-center text-xs text-muted-foreground tabular-nums">
        Profo 商圈分析 v3.2 · 数据源: 链家 / 贝壳 / 网签 · 最近更新 {lastUpdated}
      </p>
    </footer>
  );
}
