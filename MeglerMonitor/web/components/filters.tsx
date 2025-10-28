"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface FilterState {
  source?: string;
  city?: string;
  chain?: string;
  district?: string;
  role?: string;
  propertyType?: string;
  segment?: string;
  priceBucket?: string;
  onlySold?: boolean;
  minSoldCount?: number;
  search?: string;
}

interface Props {
  sources: string[];
  cities: string[];
  chains: string[];
  propertyTypes: string[];
  districts: string[];
  roles: string[];
  segments: string[];
  priceBuckets: string[];
  value: FilterState;
  onChange: (next: FilterState) => void;
  onReset: () => void;
}

export function Filters({
  sources,
  cities,
  chains,
  propertyTypes,
  districts,
  roles,
  segments,
  priceBuckets,
  value,
  onChange,
  onReset,
}: Props) {
  const [local, setLocal] = useState<FilterState>(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      onChange(local);
    }, 250);
    return () => clearTimeout(timeout);
  }, [local, onChange]);

  return (
    <div className="space-y-4 rounded-lg border border-border/60 bg-card/40 p-4 text-sm">
      <div className="grid gap-4 md:grid-cols-4">
        <Select
          value={local.source ?? ""}
          onChange={(event) => setLocal((prev) => ({ ...prev, source: event.target.value || undefined }))}
          label="Datakilde"
        >
          <option value="">Alle datakilder</option>
          {sources.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </Select>
        <Select
          value={local.city ?? ""}
          onChange={(event) => setLocal((prev) => ({ ...prev, city: event.target.value || undefined, district: undefined }))}
          label="Lokasjon"
        >
          <option value="">Alle lokasjoner</option>
          {cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </Select>
        <Select
          value={local.chain ?? ""}
          onChange={(event) => setLocal((prev) => ({ ...prev, chain: event.target.value || undefined }))}
          label="Meglerkjede"
        >
          <option value="">Alle meglerkjeder</option>
          {chains.map((chain) => (
            <option key={chain} value={chain}>
              {chain}
            </option>
          ))}
        </Select>
        <div className="flex flex-col text-muted-foreground">
          <span className="text-xs uppercase">Fritekstsøk</span>
          <Input
            value={local.search ?? ""}
            placeholder="Søk etter megler, kjede eller eiendom"
            onChange={(event) => setLocal((prev) => ({ ...prev, search: event.target.value || undefined }))}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Select
          value={local.district ?? ""}
          onChange={(event) => setLocal((prev) => ({ ...prev, district: event.target.value || undefined }))}
          label="Markedsområde"
          disabled={!local.city || !districts.length}
        >
          <option value="">Alle områder</option>
          {districts.map((district) => (
            <option key={district} value={district}>
              {district}
            </option>
          ))}
        </Select>
        <Select
          value={local.role ?? ""}
          onChange={(event) => setLocal((prev) => ({ ...prev, role: event.target.value || undefined }))}
          label="Meglerrolle"
        >
          <option value="">Alle roller</option>
          {roles.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </Select>
        <Select
          value={local.propertyType ?? ""}
          onChange={(event) => setLocal((prev) => ({ ...prev, propertyType: event.target.value || undefined }))}
          label="Eiendomstype"
        >
          <option value="">Alle eiendomstyper</option>
          {propertyTypes.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </Select>
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase text-muted-foreground">Markedssegment</span>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={`rounded-full border px-3 py-1 text-xs ${!local.segment ? "border-primary/60 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground"}`}
              onClick={() => setLocal((prev) => ({ ...prev, segment: undefined }))}
            >
              Alle markedssegmenter
            </button>
            {segments.length ? (
              segments.map((segment) => {
                const active = local.segment === segment;
                return (
                  <button
                    key={segment}
                    type="button"
                    className={`rounded-full px-3 py-1 text-xs transition ${
                      active
                        ? "border-primary/60 bg-primary/10 text-primary"
                        : "border border-border/60 text-muted-foreground hover:border-primary/40"
                    }`}
                    onClick={() => setLocal((prev) => ({ ...prev, segment }))}
                  >
                    {segment}
                  </button>
                );
              })
            ) : (
              <span className="text-xs text-muted-foreground">Ingen segmenter</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Select
          value={local.priceBucket ?? ""}
          onChange={(event) => setLocal((prev) => ({ ...prev, priceBucket: event.target.value || undefined }))}
          label="Prisklasse"
        >
          <option value="">Alle prisklasser</option>
          {priceBuckets.map((bucket) => (
            <option key={bucket} value={bucket}>
              {bucket}
            </option>
          ))}
        </Select>
        <div className="flex flex-col gap-2">
          <span className="text-xs uppercase text-muted-foreground">Solgte eiendommer</span>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={Boolean(local.onlySold)}
              onChange={(event) => setLocal((prev) => ({ ...prev, onlySold: event.target.checked || undefined }))}
            />
            Vis kun gjennomførte salg
          </label>
        </div>
        <div className="flex flex-col text-muted-foreground">
          <span className="text-xs uppercase">Minimum salg</span>
          <Input
            type="number"
            min={0}
            value={local.minSoldCount ?? ""}
            placeholder="0"
            onChange={(event) => {
              const value = event.target.value;
              if (!value) {
                setLocal((prev) => ({ ...prev, minSoldCount: undefined }));
                return;
              }
              const parsed = Number(value);
              if (Number.isNaN(parsed)) {
                return;
              }
              setLocal((prev) => ({ ...prev, minSoldCount: parsed }));
            }}
          />
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          className="rounded-md border border-border px-3 py-2 text-xs uppercase text-muted-foreground transition hover:bg-muted/20"
          onClick={() => {
            setLocal({});
            onReset();
          }}
        >
          Tilbakestill alle filter
        </button>
      </div>
    </div>
  );
}
