"use client";

/**
 * 招募管理错误边界.
 *
 * 覆盖 campaigns / leads / funnel 子路由，当 Server Component 数据层抛出错误时
 * 展示错误态（含重试入口），与空态可区分。
 */

import { useEffect } from "react";
import { AlertCircle, RefreshCcw } from "lucide-react";

export default function RecruitError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 服务端日志已在数据层记录，此处仅做客户端错误上报占位
    console.error("[Recruit] Error boundary caught:", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="rounded-full bg-rust/10 p-4">
        <AlertCircle className="h-8 w-8 text-rust" />
      </div>
      <h2 className="text-lg font-medium text-ink">数据加载失败</h2>
      <p className="text-sm text-graphite text-center max-w-sm">
        招募管理数据暂时不可用，请检查网络连接后重试。
        {error.digest && (
          <span className="block mt-1 text-xs text-slate">错误编号: {error.digest}</span>
        )}
      </p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex items-center gap-1.5 h-9 px-5 rounded-full bg-ink text-white text-[14px] font-medium hover:bg-black transition-colors"
      >
        <RefreshCcw className="h-4 w-4" />
        重试
      </button>
    </div>
  );
}
