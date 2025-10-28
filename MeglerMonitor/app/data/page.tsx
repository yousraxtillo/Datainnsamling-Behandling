"use client";

import { useMemo } from "react";

import { Button } from "@/components/ui/button";
import { ListingsTable } from "@/components/listings-table";
import { useListings } from "@/lib/api";
import { fmtNOK } from "@/lib/utils";

function downloadAll(listings: ReturnType<typeof useListings>["listings"]) {
  if (!listings?.length) return;
  const blob = new Blob([JSON.stringify(listings, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "megler-monitor.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function DataPage() {
  const { listings, isLoading } = useListings({});

  const stats = useMemo(() => {
    if (!listings?.length) {
      return null;
    }
    const latest = listings.reduce((acc, listing) => (listing.snapshot_at > acc ? listing.snapshot_at : acc), listings[0].snapshot_at);
    const totalValue = listings.reduce((acc, listing) => acc + (listing.price ?? 0), 0);
    const chains = new Set(listings.map((listing) => listing.chain).filter(Boolean));
    const brokers = new Set(listings.map((listing) => listing.broker).filter(Boolean));
    return {
      latestSnapshot: latest,
      totalValue,
      chains: chains.size,
      brokers: brokers.size,
    };
  }, [listings]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Datahub</h2>
          <p className="text-sm text-muted-foreground">Oversikt over siste snapshot og eksportmuligheter.</p>
        </div>
        <Button variant="secondary" disabled={!listings?.length} onClick={() => downloadAll(listings)}>
          Last ned JSON
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-border/60 bg-card/40 p-4">
          <div className="text-xs uppercase text-muted-foreground">Siste snapshot</div>
          <div className="text-lg font-semibold">
            {stats ? new Date(stats.latestSnapshot).toLocaleString("no-NO") : isLoading ? "…" : "Ukjent"}
          </div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card/40 p-4">
          <div className="text-xs uppercase text-muted-foreground">Total verdi</div>
          <div className="text-lg font-semibold">{stats ? fmtNOK(stats.totalValue) : isLoading ? "…" : "—"}</div>
        </div>
        <div className="rounded-lg border border-border/60 bg-card/40 p-4">
          <div className="text-xs uppercase text-muted-foreground">Meglere & Kjeder</div>
          <div className="text-lg font-semibold">
            {stats ? `${stats.brokers} meglere · ${stats.chains} kjeder` : isLoading ? "…" : "—"}
          </div>
        </div>
      </div>

      <ListingsTable listings={listings} />
    </div>
  );
}
