"use client";

import { ReactNode } from "react";

interface SectionHeaderProps {
  index: string;
  title: string;
  subtitle: string;
  action?: ReactNode;
}

export function SectionHeader({ index, title, subtitle, action }: SectionHeaderProps) {
  return (
    <div className="flex items-center justify-between px-6 py-3 bg-muted/50 border-b border-border mb-6">
      <div className="flex items-baseline gap-2">
        <span className="text-primary font-bold text-lg font-mono">{index}.</span>
        <h3 className="text-foreground font-bold text-base">{title}</h3>
        <span className="text-muted-foreground text-xs font-medium uppercase tracking-wider ml-1">
          {subtitle}
        </span>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
