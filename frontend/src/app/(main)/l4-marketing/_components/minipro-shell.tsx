import * as React from "react";

import { cn } from "@/lib/utils";

interface MiniproShellProps {
  children: React.ReactNode;
  className?: string;
  containerClassName?: string;
}

export function MiniproShell({
  children,
  className,
  containerClassName,
}: MiniproShellProps) {
  return (
    <div className={cn("min-h-screen bg-slate-50/50", className)}>
      <div
        className={cn(
          "w-full max-w-[1600px] mx-auto flex flex-col gap-6 py-8 px-4 sm:px-6 lg:px-8",
          containerClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}

interface MiniproPageHeaderProps {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
}

export function MiniproPageHeader({
  title,
  description,
  actions,
}: MiniproPageHeaderProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        {description ? (
          <p className="text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
