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
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-sm text-foreground">{value}</div>
    </div>
  );
}
