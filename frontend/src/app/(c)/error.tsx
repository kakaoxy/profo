"use client";

import { useEffect } from "react";
import { AlertCircle, RotateCcw } from "lucide-react";

export default function CError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[C 端路由错误]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-20 text-graphite">
      <AlertCircle className="mb-4 h-12 w-12 text-c-error/50" />
      <p className="text-lg font-medium text-ink">页面加载失败</p>
      <p className="mt-1 text-sm">请稍后重试，或联系客服</p>
      <button
        onClick={reset}
        className="mt-4 inline-flex items-center gap-2 rounded-full bg-ink px-6 py-2 text-sm font-medium text-white hover:opacity-90 transition-opacity"
      >
        <RotateCcw className="h-4 w-4" />
        重新加载
      </button>
    </div>
  );
}
