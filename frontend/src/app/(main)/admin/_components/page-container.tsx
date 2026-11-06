import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface PageContainerProps {
  children: ReactNode;
  /** 追加类名（如 `flex flex-col gap-8`）；不得用于覆盖宽度上限 */
  className?: string;
}

/**
 * 后台页面统一内容容器。
 *
 * DESIGN 规定页面最大宽度 1200px；左右 padding 使用 4px 网格（移动 16 / 平板 24 / 桌面 32）。
 * 页面如需纵向节奏，通过 className 传入 4px 网格间距，不得另建居中窄容器。
 */
export function PageContainer({ children, className }: PageContainerProps) {
  return (
    <div className={cn("mx-auto w-full max-w-[1200px] px-4 py-8 sm:px-6 lg:px-8", className)}>
      {children}
    </div>
  );
}
