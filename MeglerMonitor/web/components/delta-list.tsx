"use client";

import type { DeltaAggregate } from "@/lib/api";
import { fmtMaybeCompactNOK, slugify } from "@/lib/utils";

interface Props {
  title: string;
  data: DeltaAggregate[] | undefined;
  variant: "growing" | "falling";
}

export function DeltaList({ title, data, variant }: Props) {
  const isGrowing = variant === "growing";
  return (
    <div className="rounded-lg border border-border/60 p-4">
      <div className="pb-3 text-sm font-semibold text-muted-foreground">{title}</div>
      <div className="space-y-2">
        {data?.length ? (
          data.map((row, idx) => (
            <div key={`${variant}-${idx}`} className="flex items-center justify-between gap-4 rounded-md bg-muted/20 px-3 py-2">
              <div>
                <div className="text-sm font-medium text-foreground">
                  <a href={`/broker/${slugify(row.broker ?? "ukjent")}`}>{row.broker ?? "Ikke registrert"}</a>
                </div>
                <div className="text-xs text-muted-foreground">{row.chain ?? "—"}</div>
              </div>
              <div className={`text-sm font-semibold ${isGrowing ? "text-emerald-400" : "text-rose-400"}`}>
                {isGrowing ? "+" : "-"}{fmtMaybeCompactNOK(Math.abs(row.delta))}
              </div>
            </div>
          ))
        ) : (
          <div className="text-sm text-muted-foreground">Ingen signifikante endringer registrert.</div>
        )}
      </div>
    </div>
  );
}
