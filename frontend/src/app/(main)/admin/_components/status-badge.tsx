import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "attention" | "positive";

/**
 * 状态徽标统一语义色。
 * Fog = 中性，Apricot/Rust = 需注意，Sky Wash/Ink = 正向。
 * 不使用饱和色，也不使用 Ink 实心填充（Ink 实心只留给主 CTA）。
 */
const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-fog text-graphite",
  attention: "bg-apricot-wash text-rust",
  positive: "bg-sky-wash text-ink",
};

export function StatusBadge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: StatusTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center whitespace-nowrap rounded-full px-3 text-[14px] leading-none font-[450] tracking-[-0.009em]",
        TONE_CLASS[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
