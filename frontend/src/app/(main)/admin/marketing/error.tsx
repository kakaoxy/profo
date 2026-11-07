"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer } from "@/app/(main)/admin/_components/page-container";
import { logger } from "@/lib/logger";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function MarketingProjectsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    logger.error("Marketing Projects Page Error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-fog">
      <PageContainer className="flex min-h-[calc(100vh-8rem)] items-center justify-center">
        <div className="w-full max-w-[520px] rounded-cards bg-white p-8 text-center shadow-steep-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-apricot-wash text-rust">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="mt-6 text-[10px] font-medium uppercase tracking-[0.14em] text-graphite">
            Loading error <span className="text-dove">/</span> 加载异常
          </div>
          <h1 className="page-title mt-3 text-[36px] text-ink">数据加载失败</h1>
          <p className="mx-auto mt-3 max-w-[360px] text-sm leading-relaxed text-graphite">
            {error.message || "暂时无法获取营销项目数据，请稍后重试。"}
          </p>
          {error.digest ? (
            <div className="mt-5 inline-flex rounded-full bg-fog px-3 py-1.5 font-mono text-[10px] text-dove">
              ERR_MARKETING_FETCH · {error.digest}
            </div>
          ) : null}
          <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
            <Button
              type="button"
              onClick={reset}
              className="h-11 rounded-full bg-ink px-5 text-sm font-medium text-white hover:bg-ink/90"
            >
              <RotateCcw className="h-4 w-4" />
              重试加载
            </Button>
            <Button
              asChild
              variant="outline"
              className="h-11 rounded-full border-dove bg-white px-5 text-sm text-ink hover:bg-fog"
            >
              <Link href="/admin/marketing">
                <ArrowLeft className="h-4 w-4" />
                返回列表
              </Link>
            </Button>
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
