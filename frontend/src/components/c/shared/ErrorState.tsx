import { AlertCircle } from "lucide-react";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({ title = "加载失败", description = "请检查网络连接后重试", onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-graphite">
      <AlertCircle className="mb-4 h-12 w-12 text-c-error/50" />
      <p className="text-lg font-medium text-ink">{title}</p>
      <p className="mt-1 text-sm">{description}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-4 text-[15px] font-medium text-ink underline-offset-4 hover:underline transition-colors"
        >
          重新加载
        </button>
      )}
    </div>
  );
}
