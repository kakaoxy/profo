import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  /** 页面主标题文本 */
  title: ReactNode;
  /** 可选副标题说明；无说明文案的页面不传 */
  description?: ReactNode;
  className?: string;
}

/**
 * 后台页面统一页头。
 *
 * 主标题固定为 `<h1 className="font-display text-3xl text-ink">`（Signifier / 30px / Ink），
 * 副标题为 `<p className="mt-1.5 text-[15px] text-graphite">`。
 * 所有页面主标题必须使用本组件，禁止页面私有字号（16/20/24/26/40px）与 h2 主标题。
 * Server Component 可渲染，无浏览器 API / hooks 依赖。
 */
export function PageHeader({ title, description, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-1", className)}>
      <h1 className="font-display text-3xl text-ink">{title}</h1>
      {description ? <p className="mt-1.5 text-[15px] text-graphite">{description}</p> : null}
    </header>
  );
}
