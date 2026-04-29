import * as React from "react";

interface SectionProps {
  title: string;
  children: React.ReactNode;
}

/**
 * 区块标题组件
 */
export function Section({ title, children }: SectionProps) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-foreground mb-3">{title}</h4>
      {children}
    </div>
  );
}
