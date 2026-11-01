import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * 表单字段：可见标签 + 必填标记 + 可选说明。
 * 输入框作为 <label> 的后代，靠隐式关联获得可访问名称，无需为每个字段维护 id/htmlFor。
 */
export function Field({
  label,
  required,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Label
      className={cn(
        // Label 基类带 items-center，纵向排列必须显式 items-stretch，否则文字居中
        "flex flex-col items-stretch gap-1.5 text-[13px] leading-tight font-normal text-graphite",
        className,
      )}
    >
      <span>
        {label}
        {required ? <span className="ml-0.5 text-rust">*</span> : null}
      </span>
      {children}
      {hint ? <span className="text-xs leading-relaxed text-graphite">{hint}</span> : null}
    </Label>
  );
}
