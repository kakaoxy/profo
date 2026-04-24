"use client";

import { KeyRound, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ApiKeyEmptyStateProps {
  onGenerate: () => void;
}

export function ApiKeyEmptyState({ onGenerate }: ApiKeyEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30 p-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 mb-4">
        <KeyRound className="h-8 w-8 text-slate-400 dark:text-slate-500" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
        暂无 API Key
      </h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-6">
        生成 API Key 后，您可以通过程序化方式访问系统接口，实现与其他系统的集成
      </p>
      <Button onClick={onGenerate} className="gap-2">
        <Plus className="h-4 w-4" />
        生成 API Key
      </Button>
    </div>
  );
}
