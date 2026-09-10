"use client";

import { Button } from "@/components/ui/button";

export default function LedgerError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-fog">
      <div className="flex flex-col items-center gap-4 rounded-cards bg-white px-8 py-10 text-center shadow-steep">
        <h2 className="text-xl font-medium text-ink">加载失败</h2>
        <p className="text-sm text-graphite">资金账本页面数据加载出错，请重试</p>
        <Button onClick={reset} className="h-10 rounded-full bg-ink text-white hover:bg-ink/90">
          重新加载
        </Button>
      </div>
    </div>
  );
}
