import { cn } from "@/lib/utils";

/** 头像色板：DESIGN 只允许 pastel（Apricot / Sky / Fog）作为点缀色. */
const TONES = ["bg-apricot-wash", "bg-sky-wash", "bg-fog"] as const;

/**
 * 经纪人首字头像（REQ-IT7-03 设计稿）。
 *
 * 用姓名首字 + pastel 圆底；色板按 id 稳定散列，列表刷新不跳色。
 */
export function BrokerAvatar({
  name,
  id,
  size = "md",
  className,
}: {
  name: string;
  id: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const hash = Array.from(id).reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const sizeClass = size === "lg" ? "h-11 w-11 text-base" : size === "sm" ? "h-7 w-7 text-xs" : "h-9 w-9 text-sm";
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-medium text-ink",
        sizeClass,
        TONES[hash % TONES.length],
        className,
      )}
    >
      {name.slice(0, 1)}
    </span>
  );
}
