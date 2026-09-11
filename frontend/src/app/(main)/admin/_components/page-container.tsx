import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface PageContainerProps {
  children: ReactNode;
  /** 追加类名（如 `flex flex-col gap-8`）；不得用于覆盖宽度上限 */
  className?: string;
}

/**
 * 后台页面统一内容容器（Steep 全宽栅格）。
 *
 * 类名固定为 `w-full max-w-400 mx-auto px-4 sm:px-6 lg:px-8 py-8`：
 * `max-w-400`（100rem）超出实际内容区，等价「不设宽度上限」，页面主干左对齐满宽
 * （视口 1470px 下内容起始 X≈96、内容宽≈1342）。
 *
 * 禁止页面再自定义任何窄化居中包装（自定 max-width + `mx-auto` 的组合）。
 * Server Component 可渲染，无浏览器 API / hooks 依赖。
 */
export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn("w-full max-w-400 mx-auto px-4 sm:px-6 lg:px-8 py-8", className)}>
      {children}
    </div>
  );
}
