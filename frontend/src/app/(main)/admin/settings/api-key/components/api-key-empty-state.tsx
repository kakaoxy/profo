"use client";

import { KeyRound, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ApiKeyEmptyStateProps {
  onGenerate: () => void;
}

export function ApiKeyEmptyState({ onGenerate }: ApiKeyEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center rounded-cards bg-white p-12 text-center shadow-steep">
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-inputs bg-fog">
        <KeyRound className="h-8 w-8 text-graphite" aria-hidden="true" />
      </div>
      <h3 className="mb-2 text-lg font-medium text-ink">暂无 API Key</h3>
      <p className="mb-6 max-w-sm text-sm text-graphite">
        生成 API Key 后，您可以通过程序化方式访问系统接口，实现与其他系统的集成
      </p>
      <Button onClick={onGenerate} className="gap-2">
        <Plus className="h-4 w-4" />
        生成 API Key
      </Button>
    </div>
  );
}
