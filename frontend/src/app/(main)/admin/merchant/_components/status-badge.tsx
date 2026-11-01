import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "attention" | "positive";

/**
 * 状态徽标统一语义色。
 * DESIGN 明令：Ink 实心填充只留给主 CTA（徽标用 default 会与按钮混淆），
 * 且不得引入饱和红/绿/蓝做 UI chrome（故不使用 destructive）。
 */
const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "",
  attention: "border-transparent bg-apricot-wash text-rust",
  positive: "border-rust/40 text-rust",
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
    <Badge
      variant={tone === "neutral" ? "secondary" : "outline"}
      className={cn(TONE_CLASS[tone], className)}
    >
      {children}
    </Badge>
  );
}
