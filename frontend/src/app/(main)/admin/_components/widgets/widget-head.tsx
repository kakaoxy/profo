import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface WidgetHeadProps {
  title: string;
  /** 标题右侧 12px Graphite 副标签（如「本月」「近 14 日」），对应设计稿 .wg-sub */
  sub?: string;
  /** 右侧链接文案（如「详情」「去处理」），不带则仅渲染标题 */
  link?: string;
  href?: string;
  /** 标题右侧小徽标（如「新增」），对应设计稿 .rm-new */
  badge?: string;
  /** 标题后计数徽标（如「18 个项目」），对应设计稿 .b-ghost */
  count?: string;
}

interface WidgetHeadClassProps extends WidgetHeadProps {
  /** 链接配色覆盖（暖卡传 Rust 系）；默认对应设计稿 .sec-link：Ink 13px/450，hover Rust */
  linkClassName?: string;
  /** 标题配色覆盖（暖卡 .wg.warm .wg-title 为 Rust） */
  titleClassName?: string;
}

/**
 * 工作台卡片统一头部（设计稿 WGHead，hifi:1027）。
 *
 * 结构：标题 15px/500 Ink + 副标签 12px/430 Graphite（gap 7px）；
 * 右侧链接 13px/450 Ink，hover Rust，箭头 12px（.sec-link + fontSize 13 覆写）。
 * 暖卡（待评估提醒）内标题与链接均为 Rust，由 titleClassName/linkClassName 传入。
 */
export function WidgetHead({
  title,
  sub,
  link,
  href,
  linkClassName,
  titleClassName,
  badge,
  count,
}: WidgetHeadClassProps) {
  return (
    <div className="mb-[2px] flex items-center justify-between gap-3">
      {/* data-widget-title / data-widget-link = 卡头样式的 DOM 契约（E2E 断言 15px/13px） */}
      <span
        data-widget-title={title}
        className={`flex min-w-0 items-center gap-[7px] text-[15px] font-medium ${
          titleClassName ?? "text-ink"
        }`}
      >
        {title}
        {badge ? (
          <span className="rounded-full bg-apricot-wash px-[7px] py-[2px] text-[10.5px] font-medium text-rust">
            {badge}
          </span>
        ) : null}
        {sub ? <span className="text-xs font-[430] text-graphite">{sub}</span> : null}
        {count ? (
          <span className="rounded-full bg-ink/[0.045] px-2 py-[2px] text-[11.5px] font-[450] text-graphite">
            {count}
          </span>
        ) : null}
      </span>
      {link && href ? (
        <Link
          href={href}
          data-widget-link={link}
          className={`inline-flex shrink-0 items-center gap-1 text-[13px] font-[450] transition-colors ${
            linkClassName ?? "text-ink hover:text-rust"
          }`}
        >
          {link}
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}
