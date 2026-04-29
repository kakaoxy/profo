"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface InfoCardProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function InfoCard({ title, children, className = "" }: InfoCardProps) {
  return (
    <Card className={`border-border shadow-sm ${className}`}>
      <CardHeader className="border-b border-border py-4">
        <CardTitle className="text-sm font-semibold text-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="py-6">{children}</CardContent>
    </Card>
  );
}
