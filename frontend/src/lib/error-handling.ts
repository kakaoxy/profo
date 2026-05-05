import { toast } from "sonner";
import { extractErrorMessage } from "./action-result";

export interface ErrorHandlerOptions {
  showToast?: boolean;
  logToConsole?: boolean;
  fallbackMessage?: string;
}

const DEFAULT_OPTIONS: ErrorHandlerOptions = {
  showToast: true,
  logToConsole: true,
  fallbackMessage: "操作失败，请稍后重试",
};

export function handleError(
  error: unknown,
  context: string,
  options: ErrorHandlerOptions = {}
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const errorMessage = extractErrorMessage(error, opts.fallbackMessage);

  if (opts.logToConsole) {
    console.error(`[${context}]`, error);
  }

  if (opts.showToast) {
    toast.error(errorMessage);
  }

  return errorMessage;
}

export function handleSuccess(message: string, description?: string): void {
  toast.success(message, description ? { description } : undefined);
}

export function withErrorHandling<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  context: string,
  options?: ErrorHandlerOptions
): T {
  return (async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      return (await fn(...args)) as ReturnType<T>;
    } catch (error) {
      handleError(error, context, options);
      throw error;
    }
  }) as T;
}
