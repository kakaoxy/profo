"use client";

/**
 * 商圈分析报表页错误边界。
 *
 * 出于安全考虑，不暴露 error.message（AGENTS.md §5 Fail Loud），
 * 仅显示通用文案与「重试」按钮。
 */
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function MarketReportsError({ reset }: ErrorProps) {
  return (
    <div className="min-h-screen bg-muted flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="size-5 text-destructive" aria-hidden="true" />
            <span>出错了</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">页面加载失败，请稍后重试</p>
          <Button onClick={reset}>重试</Button>
        </CardContent>
      </Card>
    </div>
  );
}
