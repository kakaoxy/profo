import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  /** 页面主标题文本 */
  title: ReactNode;
  /** 可选副标题说明；无说明文案的页面不传 */
  description?: ReactNode;
  /** 可选右侧动作区（与标题同行右对齐，如页级按钮组）；不传则保持纯标题布局 */
  actions?: ReactNode;
  className?: string;
}

/**
 * 后台页面统一页头。
 *
 * 主标题使用 `.page-title`（Signifier 400 / 1.1 / -0.015em，44px）。
 * DESIGN 规定 Signifier 不得低于 40px，因此移动端也保持 44px。
 * 副标题沿用 Sohne body 16px；动作区间距 8px。
 */
export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between",
        className,
      )}
    >
      <div>
        <h1 className="page-title text-[44px] text-ink">{title}</h1>
        {description ? (
          <p className="mt-2 text-[16px] leading-[1.38] tracking-[-0.009em] text-graphite">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
