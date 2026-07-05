"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function InvestmentDetailError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-muted flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center px-4">
        <h2 className="text-xl font-semibold text-foreground">加载失败</h2>
        <p className="text-sm text-muted-foreground">
          跟投详情加载出错，请重试
        </p>
        <div className="flex gap-3">
          <Link href="/admin/investments">
            <Button variant="outline">返回列表</Button>
          </Link>
          <Button onClick={reset} variant="default">
            重新加载
          </Button>
        </div>
      </div>
    </div>
  );
}
