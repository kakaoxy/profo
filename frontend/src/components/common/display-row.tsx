import * as React from "react";
import { cn } from "@/lib/utils";

interface DisplayRowProps {
  label: string;
  value: React.ReactNode;
  layout?: "horizontal" | "vertical";
  className?: string;
}

export function DisplayRow({ label, value, layout = "vertical", className }: DisplayRowProps) {
  if (layout === "horizontal") {
    return (
      <div className={cn("flex items-center justify-between gap-2", className)}>
        <span className="text-xs text-muted-foreground font-medium shrink-0">{label}</span>
        <span className="text-sm text-foreground">{value}</span>
      </div>
    );
  }

  return (
    <div className={cn("grid grid-cols-1 gap-1", className)}>
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}

export type { DisplayRowProps };
