import { cn } from "@/lib/utils";
import * as React from "react";

interface InfoItemProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
}

/**
 * 信息项组件
 */
export function InfoItem({ icon, label, value, muted = false }: InfoItemProps) {
  return (
    <div className="flex items-start gap-3 p-3 bg-muted rounded-lg">
      <div className="text-muted-foreground mt-0.5">{icon}</div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "text-sm font-medium",
            muted ? "text-muted-foreground" : "text-foreground"
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
