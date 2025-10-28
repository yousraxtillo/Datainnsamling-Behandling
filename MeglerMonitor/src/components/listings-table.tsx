"use client";

import { useMemo } from "react";

import type { Listing } from "@/lib/api";
import { fmtNOK, slugify } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface Props {
  listings: Listing[] | undefined;
  onExport?: () => void;
}

function downloadCsv(listings: Listing[]) {
  const headers = [
    "source",
    "listing_id",
    "title",
    "address",
    "city",
    "district",
    "chain",
    "broker",
    "price",
    "commission_est",
    "status",
    "published",
    "property_type",
    "segment",
    "price_bucket",
    "broker_role",
    "role",
    "is_sold",
    "snapshot_at",
  ];
  const rows = listings.map((listing) =>
    headers
      .map((key) => {
        const value = listing[key as keyof Listing];
        if (value === null || value === undefined) {
          return "";
        }
        return String(value).replace(/"/g, '""');
      })
      .join('","')
  );
  const csv = [`"${headers.join('","')}"`, ...rows.map((row) => `"${row}"`)].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "listings.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function ListingsTable({ listings }: Props) {
  const total = listings?.length ?? 0;
  const latestSnapshot = useMemo(() => {
    if (!listings?.length) return null;
    return listings.reduce((acc, listing) => {
      if (!listing.snapshot_at) return acc;
      return listing.snapshot_at > (acc ?? "") ? listing.snapshot_at : acc;
    }, null as string | null);
  }, [listings]);

  if (!listings?.length) {
    return (
      <div className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
        Ingen eiendommer funnet med valgte søkekriterier.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
        <span>
          Viser <strong>{total}</strong> eiendomsoppføringer. Siste dataoppdatering:{" "}
          {latestSnapshot ? new Date(latestSnapshot).toLocaleString("no-NO") : "ikke registrert"}
        </span>
        <Button variant="secondary" onClick={() => downloadCsv(listings)}>
          Last ned CSV
        </Button>
      </div>
      <div className="max-h-[420px] overflow-auto rounded-lg border border-border/60">
        <table className="min-w-full divide-y divide-border/60 text-sm">
          <thead className="sticky top-0 bg-background/95 backdrop-blur">
            <tr className="text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left">Eiendomsinformasjon</th>
              <th className="px-3 py-2 text-left">Eiendomsmegler</th>
              <th className="px-3 py-2 text-left">Meglerkjede</th>
              <th className="px-3 py-2 text-left">Lokasjon</th>
              <th className="px-3 py-2 text-left">Prisantydning</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Publisert</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {listings.map((listing) => (
              <tr key={`${listing.source}-${listing.listing_id}-${listing.snapshot_at}`} className="hover:bg-muted/20">
                <td className="px-3 py-3">
                  <div className="font-medium text-foreground">{listing.title ?? "Tittel ikke registrert"}</div>
                  <div className="text-xs text-muted-foreground">
                    {listing.address ?? "Adresse ikke oppgitt"} • {listing.source}
                  </div>
                </td>
                <td className="px-3 py-3 text-sm">
                  {listing.broker ? <a href={`/broker/${slugify(listing.broker)}`}>{listing.broker}</a> : "Ikke registrert"}
                </td>
                <td className="px-3 py-3 text-sm">{listing.chain ?? "Ikke registrert"}</td>
                <td className="px-3 py-3 text-sm">{listing.city ?? "Ikke oppgitt"}</td>
                <td className="px-3 py-3 text-sm font-semibold">
                  {listing.price ? fmtNOK(listing.price) : "—"}
                </td>
                <td className="px-3 py-3 text-xs capitalize">{listing.status ?? "ikke registrert"}</td>
                <td className="px-3 py-3 text-xs">
                  {listing.published ? new Date(listing.published).toLocaleDateString("no-NO") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
