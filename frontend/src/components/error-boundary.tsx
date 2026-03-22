"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * 错误边界组件
 * 捕获子组件树中的 JavaScript 错误，防止整个应用崩溃
 */
export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    // 更新 state 使下一次渲染显示降级 UI
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // 记录错误信息
    console.error("ErrorBoundary 捕获到错误:", error);
    console.error("错误堆栈:", errorInfo.componentStack);

    this.setState({
      error,
      errorInfo,
    });

    // 调用外部错误处理回调
    this.props.onError?.(error, errorInfo);

    // 可以在这里发送错误到监控服务（如 Sentry）
    // sendErrorToMonitoring(error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  public render() {
    if (this.state.hasError) {
      // 自定义降级 UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <ErrorFallback error={this.state.error} onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

/**
 * 默认错误降级 UI
 */
interface ErrorFallbackProps {
  error: Error | null;
  onRetry: () => void;
}

function ErrorFallback({ error, onRetry }: ErrorFallbackProps) {
  return (
    <div className="min-h-[400px] flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg border border-slate-200 p-8 text-center">
        <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-red-500" />
        </div>

        <h2 className="text-xl font-bold text-slate-900 mb-2">
          页面出现错误
        </h2>

        <p className="text-slate-500 mb-6">
          抱歉，页面加载时遇到了问题。您可以尝试刷新页面或返回首页。
        </p>

        {error && (
          <div className="bg-slate-50 rounded-lg p-4 mb-6 text-left">
            <p className="text-xs font-medium text-slate-400 mb-1">错误信息：</p>
            <p className="text-sm text-red-600 font-mono break-all">
              {error.message}
            </p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={onRetry}
            variant="outline"
            className="flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            重试
          </Button>

          <Link href="/">
            <Button className="flex items-center gap-2 w-full sm:w-auto">
              <Home className="w-4 h-4" />
              返回首页
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * 局部错误边界（用于特定区域）
 */
interface SectionErrorBoundaryProps {
  children: ReactNode;
  title?: string;
}

export function SectionErrorBoundary({
  children,
  title = "内容",
}: SectionErrorBoundaryProps) {
  return (
    <ErrorBoundary
      fallback={
        <div className="p-6 bg-slate-50 rounded-lg border border-slate-200 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
          <p className="text-sm text-slate-600">
            {title}加载失败，请刷新页面重试
          </p>
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
