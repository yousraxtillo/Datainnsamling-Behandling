"use client";

import { useMemo, useState } from "react";

import type { CommissionBrokerAggregate } from "@/lib/api";
import { fmtCompactNOK, fmtNOK, slugify } from "@/lib/utils";

type SortKey = "total_commission" | "avg_commission" | "listings";

interface Props {
  data: CommissionBrokerAggregate[] | undefined;
  trendMap?: Map<string, number>;
}

const HEADERS: Array<{ key: SortKey; label: string }> = [
  { key: "total_commission", label: "Totalprovisjon" },
  { key: "avg_commission", label: "Gj.sn. provisjon" },
  { key: "listings", label: "Transaksjoner" },
];

export function CommissionTable({ data, trendMap }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("total_commission");
  const [ascending, setAscending] = useState(false);

  const rows = useMemo(() => {
    if (!data) return [];
    const copy = [...data];
    copy.sort((a, b) => {
      const delta = (a[sortKey] ?? 0) - (b[sortKey] ?? 0);
      return ascending ? delta : -delta;
    });
    return copy;
  }, [data, sortKey, ascending]);

  if (!rows.length) {
    return (
      <div className="rounded-lg border border-border/60 p-8 text-center text-sm text-muted-foreground">
        Ingen provisjonsdata tilgjengelig for valgt tidsperiode og filter.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border/60">
      <table className="w-full divide-y divide-border/60 text-xs">
        <thead className="bg-background/95">
          <tr>
            <th className="px-2 py-2 text-left text-xs uppercase tracking-wide text-muted-foreground">#</th>
            <th className="px-3 py-2 text-left text-xs uppercase tracking-wide text-muted-foreground">Eiendomsmegler</th>
            <th className="px-2 py-2 text-left text-xs uppercase tracking-wide text-muted-foreground">Meglerkjede</th>
            {HEADERS.map((header) => (
              <th key={header.key} className="px-2 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-muted-foreground"
                  onClick={() => {
                    if (sortKey === header.key) {
                      setAscending((prev) => !prev);
                    } else {
                      setSortKey(header.key);
                      setAscending(false);
                    }
                  }}
                  aria-label={`Sorter etter ${header.label.toLowerCase()}`}
                >
                  {header.label}
                  <span className="text-[10px]">{sortKey === header.key ? (ascending ? "↑" : "↓") : "↕"}</span>
                </button>
              </th>
            ))}
            <th className="px-2 py-2 text-right text-xs uppercase tracking-wide text-muted-foreground">Trend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/50">
          {rows.map((row, idx) => {
            const key = `${row.broker ?? "ukjent"}::${row.chain ?? ""}`;
            const delta = trendMap?.get(key) ?? 0;
            const rankIcon = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;
            return (
              <tr key={`${row.broker}-${row.chain}-${idx}`} className="hover:bg-muted/20">
                <td className="px-2 py-2">
                  <span className="flex items-center gap-2">
                    <span>{idx + 1}</span>
                    {rankIcon ? <span aria-hidden="true">{rankIcon}</span> : null}
                  </span>
                </td>
                <td className="px-3 py-2 font-medium text-foreground">
                  <a 
                    href={`/broker/${slugify(row.broker ?? "ukjent")}`}
                    className="hover:text-blue-400 hover:underline transition-colors"
                  >
                    {row.broker ?? "Ikke registrert"}
                  </a>
                </td>
                <td className="px-2 py-2 text-muted-foreground">{row.chain ?? "Ikke registrert"}</td>
                <td
                  className="px-2 py-2 text-right font-semibold"
                  title={fmtNOK(row.total_commission)}
                >
                  {fmtCompactNOK(row.total_commission)}
                </td>
                <td className="px-2 py-2 text-right" title={fmtNOK(row.avg_commission)}>
                  {fmtNOK(row.avg_commission)}
                </td>
                <td className="px-2 py-2 text-right">{row.listings}</td>
                <td className="px-2 py-2 text-right">
                  {delta > 0 && (
                    <span
                      className="rounded-full bg-emerald-500/20 px-2 py-1 text-xs text-emerald-300"
                      title={`Økning på ${fmtNOK(delta)}`}
                    >
                      +{fmtNOK(delta)}
                    </span>
                  )}
                  {delta < 0 && (
                    <span
                      className="rounded-full bg-rose-500/20 px-2 py-1 text-xs text-rose-300"
                      title={`Nedgang på ${fmtNOK(Math.abs(delta))}`}
                    >
                      -{fmtNOK(Math.abs(delta))}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
