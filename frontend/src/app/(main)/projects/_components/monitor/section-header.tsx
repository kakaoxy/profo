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
    <div className="flex items-center justify-between px-6 py-3 bg-slate-50/50 border-b border-slate-100 mb-6">
      <div className="flex items-baseline gap-2">
        <span className="text-blue-600 font-bold text-lg font-mono">{index}.</span>
        <h3 className="text-slate-900 font-bold text-base">{title}</h3>
        <span className="text-slate-400 text-xs font-medium uppercase tracking-wider ml-1">
          {subtitle}
        </span>
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
