"use client";

import { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  value: ReactNode;
  subtitle?: ReactNode;
  className?: string;
}

export function KpiCard({ title, value, subtitle, className }: Props) {
  return (
    <Card className={cn("bg-gradient-to-b from-card/70 to-card/40", className)}>
      <CardHeader>
        <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-3xl font-bold">{value}</CardContent>
      {subtitle ? <div className="pt-2 text-xs text-muted-foreground">{subtitle}</div> : null}
    </Card>
  );
}
