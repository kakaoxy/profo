"use client";

import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ProjectsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-fog">
      <div className="mx-auto w-full max-w-[1200px] px-4 pb-12 pt-8 sm:px-6 lg:px-8">
        <header>
          <p className="flex items-center gap-2 text-[10px] font-[480] uppercase tracking-[0.16em] text-graphite">
            Projects <span className="h-px w-4 bg-rust/70" /> 资产全周期
          </p>
          <h1 className="mt-3 font-signifier text-[30px] font-[420] leading-none tracking-[-0.02em] text-ink md:text-[44px]">项目管理</h1>
        </header>
        <div className="mt-8 rounded-cards bg-pure-white p-10 text-center shadow-steep">
          <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-apricot-wash text-rust">
            <AlertCircle className="h-5 w-5" />
          </span>
          <h2 className="mt-4 text-[18px] font-[480] text-ink">数据加载失败</h2>
          <p className="mx-auto mt-2 max-w-[360px] text-[13px] leading-6 text-graphite">
            项目管理页面数据加载出错，请稍后重试。当前筛选会保留在地址栏中。
          </p>
          <Button onClick={reset} className="mt-5 rounded-full bg-ink px-5 text-[13px] text-pure-white hover:bg-ink/90">
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> 重新加载
          </Button>
          {error.digest ? <p className="mt-3 text-[10px] text-dove">错误编号 {error.digest}</p> : null}
        </div>
      </div>
    </div>
  );
}
