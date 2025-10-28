"use client";

import type { BrokerAggregate, ChainAggregate } from "@/lib/api";
import { fmtMaybeCompactNOK, slugify } from "@/lib/utils";

interface Props<T> {
  title: string;
  data: T[] | undefined;
  type: "broker" | "chain";
}

export function AggTable<T extends BrokerAggregate | ChainAggregate>({ title, data, type }: Props<T>) {
  return (
    <div className="rounded-lg border border-border/60 p-4">
      <div className="pb-3 text-sm font-semibold text-muted-foreground">{title}</div>
      <div className="space-y-3">
        {data?.slice(0, 5).map((row, idx) => (
          <div key={`${type}-${idx}`} className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-foreground">
                {type === "broker" ? (
                  <a href={`/broker/${slugify((row as BrokerAggregate).broker ?? "ukjent")}`}>
                    {(row as BrokerAggregate).broker ?? "Ikke registrert"}
                  </a>
                ) : (
                  (row as ChainAggregate).chain ?? "Ikke registrert"
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {type === "broker" ? (row as BrokerAggregate).chain ?? "—" : `${(row as ChainAggregate).count} oppføringer`}
              </div>
            </div>
            <div className="text-right text-sm font-semibold">
              {fmtMaybeCompactNOK(row.total_value)}
              <div className="text-xs text-muted-foreground">{row.count.toLocaleString("no-NO")} eiendommer</div>
            </div>
          </div>
        ))}
        {!data?.length && <div className="text-sm text-muted-foreground">Ingen data tilgjengelig i valgt periode.</div>}
      </div>
    </div>
  );
}
