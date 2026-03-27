"use client";

import * as React from "react";

interface DisplayRowProps {
  label: string;
  value: React.ReactNode;
  className?: string;
}

export function DisplayRow({ label, value, className = "" }: DisplayRowProps) {
  return (
    <div className={`grid grid-cols-1 gap-1 ${className}`}>
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className="text-sm text-slate-800">{value}</div>
    </div>
  );
}
