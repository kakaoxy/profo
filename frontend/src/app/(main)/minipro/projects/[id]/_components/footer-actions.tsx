"use client";

import { Button } from "@/components/ui/button";

interface FooterActionsProps {
  onGoBack: () => void;
}

export function FooterActions({ onGoBack }: FooterActionsProps) {
  return (
    <div className="flex justify-end gap-3 pt-6 pb-12">
      <Button type="button" variant="outline" onClick={onGoBack}>
        取消
      </Button>
      <Button type="submit">保存并发布</Button>
    </div>
  );
}
