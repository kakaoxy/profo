"use client";

import { Button } from "@/components/ui/button";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function LeadDetailError({ reset }: ErrorProps) {
  return (
    <div className="flex flex-1 items-center justify-center bg-muted/30 px-4 py-20">
      <div className="flex flex-col items-center gap-4 text-center">
        <h2 className="text-xl font-semibold text-foreground">加载失败</h2>
        <p className="text-sm text-muted-foreground">
          线索详情数据加载出错，请重试
        </p>
        <Button onClick={reset} variant="default">
          重试
        </Button>
      </div>
    </div>
  );
}
