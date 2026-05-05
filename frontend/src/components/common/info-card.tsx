import * as React from "react";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const gridColsMap: Record<number, string> = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
  4: "sm:grid-cols-4",
};

interface InfoCardProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  gridColumns?: number;
}

export function InfoCard({ title, icon, children, className, gridColumns }: InfoCardProps) {
  return (
    <Card className={cn("border-border shadow-sm py-0 gap-0", className)}>
      <CardHeader className="border-b border-border py-3 px-4 !pb-3">
        <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-1.5">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent
        className={
          gridColumns
            ? cn("grid gap-x-8 gap-y-1 px-4 py-4", gridColsMap[gridColumns] ?? "sm:grid-cols-2")
            : "py-4 px-4"
        }
      >
        {children}
      </CardContent>
    </Card>
  );
}

export type { InfoCardProps };
