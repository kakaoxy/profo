"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCcw, Home } from "lucide-react";
import Link from "next/link";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function MarketingProjectsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // 记录错误到控制台
    console.error("Marketing Projects Page Error:", error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-50/50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-slate-200 p-8 text-center">
        {/* Error Icon */}
        <div className="mx-auto w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-6">
          <AlertCircle className="h-8 w-8 text-red-500" />
        </div>

        {/* Error Title */}
        <h2 className="text-xl font-semibold text-slate-900 mb-2">
          页面加载失败
        </h2>

        {/* Error Message */}
        <p className="text-sm text-slate-500 mb-6">
          {error.message || "获取营销项目列表时发生错误，请稍后重试"}
        </p>

        {/* Error Digest (for debugging) */}
        {error.digest && (
          <p className="text-xs text-slate-400 mb-6 font-mono">
            错误代码: {error.digest}
          </p>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={reset}
            variant="default"
            className="bg-blue-600 hover:bg-blue-700"
          >
            <RefreshCcw className="mr-2 h-4 w-4" />
            重试
          </Button>
          
          <Link href="/l4-marketing/projects">
            <Button variant="outline" className="w-full sm:w-auto">
              <Home className="mr-2 h-4 w-4" />
              返回列表
            </Button>
          </Link>
        </div>

        {/* Help Text */}
        <p className="text-xs text-slate-400 mt-6">
          如果问题持续存在，请联系管理员或稍后重试
        </p>
      </div>
    </div>
  );
}
