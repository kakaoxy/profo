"use client";

import { useState } from "react";
import { KeyRound, Loader2, AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { generateApiKeyAction, ApiKeyCreateResponse } from "../actions";

interface GenerateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (data: ApiKeyCreateResponse) => void;
}

export function GenerateDialog({ open, onOpenChange, onSuccess }: GenerateDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await generateApiKeyAction();

      if (result.success && result.data) {
        onSuccess(result.data);
      } else {
        setError(result.message || "生成失败");
      }
    } catch (err) {
      setError("网络错误，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5" />
            生成 API Key
          </DialogTitle>
          <DialogDescription>
            生成新的 API Key 后，当前使用的 Key（如果有）将被自动撤销。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/20 p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                重要提示
              </p>
              <ul className="text-sm text-amber-700 dark:text-amber-300 space-y-1">
                <li>• 每个用户只能拥有一个有效的 API Key</li>
                <li>• 新生成的 Key 仅显示一次，请务必立即复制保存</li>
                <li>• 旧 Key 将被立即撤销，使用旧 Key 的请求将失败</li>
              </ul>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            取消
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={loading}
            className="w-full sm:w-auto gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                生成中...
              </>
            ) : (
              <>
                <KeyRound className="h-4 w-4" />
                确认生成
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
