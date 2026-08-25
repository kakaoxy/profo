"use client";

import { Button } from "@/components/ui/button";

export default function ProjectsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-fog flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 text-center px-4">
        <h2 className="text-xl font-semibold text-ink">页面加载失败</h2>
        <p className="text-sm text-ash">项目管理页面数据加载出错，请重试</p>
        <Button onClick={reset} variant="default">
          重新加载
        </Button>
      </div>
    </div>
  );
}
