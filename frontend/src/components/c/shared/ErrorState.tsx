import { AlertCircle } from "lucide-react";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
}

export function ErrorState({ title = "加载失败", description = "请检查网络连接后重试", onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-graphite">
      <AlertCircle className="mb-4 h-12 w-12 text-c-error/50" aria-hidden="true" />
      <p className="text-[18px] font-medium leading-[1.35] text-ink">{title}</p>
      <p className="mt-1.5 text-[14px] leading-[1.5] text-graphite">{description}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 text-[15px] font-medium tracking-[-0.009em] text-ink underline-offset-4 transition-colors hover:underline"
          aria-label="重新加载"
        >
          重新加载
        </button>
      )}
    </div>
  );
}
