"use client";

import type { CommissionBrokerAggregate } from "@/lib/api";
import { fmtMaybeCompactNOK, fmtNOK } from "@/lib/utils";

interface Props {
  data: CommissionBrokerAggregate[] | undefined;
}

export function CommissionBarChart({ data }: Props) {
  if (!data?.length) {
    return (
      <div className="rounded-lg border border-border/60 p-6 text-center text-sm text-muted-foreground">
        Ingen provisjonsdata tilgjengelig.
      </div>
    );
  }

  const topTen = data.slice(0, 10);
  const maxValue = Math.max(...topTen.map((item) => item.total_commission), 1);

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4">
      <h3 className="pb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Top 10 meglere (total provisjon)</h3>
      <div className="space-y-2">
        {topTen.map((item) => {
          const percentage = Math.max(item.total_commission / maxValue, 0);
          return (
            <div key={`${item.broker}-${item.chain}`} className="space-y-1" title={fmtNOK(item.total_commission)}>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="truncate pr-2 font-medium text-foreground">{item.broker ?? "Ukjent"}</span>
                <span>{fmtMaybeCompactNOK(item.total_commission)}</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted/30">
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(percentage * 100, 3)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
