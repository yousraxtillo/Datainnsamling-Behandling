"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { AggTable } from "@/components/agg-table";
import { CommissionBarChart } from "@/components/commission-bar-chart";
import { CommissionTable } from "@/components/commission-table";
import { DeltaList } from "@/components/delta-list";
import { Filters } from "@/components/filters";
import { KpiCard } from "@/components/kpi-card";
import { ListingsTable } from "@/components/listings-table";
import {
  useBrokerAgg,
  useChainAgg,
  useCommissionBrokers,
  useCommissionChains,
  useCommissionTrends,
  useDeltaAgg,
  useDistrictAgg,
  useFilterMeta,
  useListings,
  useMetrics,
} from "@/lib/api";
import { computeAverageDaysOnMarket, countSold, splitDeltas, uniqueValues } from "@/lib/agg";
import { fmtCompactNOK, fmtNOK, slugify } from "@/lib/utils";

type FilterState = {
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
};

const DEFAULT_ROLE_OPTIONS = ["Megler", "Fullmektig", "Oppgjør", "Annet"];

function OverviewPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const searchFilterState = useMemo<FilterState>(() => {
    const minSoldParam = searchParams.get("minSoldCount");
    const parsedMinSold = minSoldParam ? Number(minSoldParam) : undefined;
    return {
      source: searchParams.get("source") ?? undefined,
      city: searchParams.get("city") ?? undefined,
      chain: searchParams.get("chain") ?? undefined,
      district: searchParams.get("district") ?? undefined,
      role: searchParams.get("role") ?? undefined,
      propertyType: searchParams.get("propertyType") ?? undefined,
      segment: searchParams.get("segment") ?? undefined,
      priceBucket: searchParams.get("priceBucket") ?? undefined,
      onlySold: searchParams.get("onlySold") === "true" ? true : undefined,
      minSoldCount: Number.isNaN(parsedMinSold ?? NaN) ? undefined : parsedMinSold,
      search: searchParams.get("search") ?? undefined,
    };
  }, [searchParams]);

  const [filters, setFilters] = useState<FilterState>(searchFilterState);

  const filterKeys = useMemo(
    () =>
      [
        "source",
        "city",
        "chain",
        "district",
        "role",
        "propertyType",
        "segment",
        "priceBucket",
        "onlySold",
        "minSoldCount",
        "search",
      ] as const,
    []
  );

  const filtersEqual = useCallback(
    (a: FilterState, b: FilterState) => filterKeys.every((key) => (a[key] ?? undefined) === (b[key] ?? undefined)),
    [filterKeys]
  );

  useEffect(() => {
    setFilters((current) => (filtersEqual(current, searchFilterState) ? current : searchFilterState));
  }, [filtersEqual, searchFilterState]);

  const applyFiltersToUrl = useCallback(
    (nextFilters: FilterState) => {
      const params = new URLSearchParams();
      if (nextFilters.source) params.set("source", nextFilters.source);
      if (nextFilters.city) params.set("city", nextFilters.city);
      if (nextFilters.chain) params.set("chain", nextFilters.chain);
      if (nextFilters.district) params.set("district", nextFilters.district);
      if (nextFilters.role) params.set("role", nextFilters.role);
      if (nextFilters.propertyType) params.set("propertyType", nextFilters.propertyType);
      if (nextFilters.segment) params.set("segment", nextFilters.segment);
      if (nextFilters.priceBucket) params.set("priceBucket", nextFilters.priceBucket);
      if (nextFilters.onlySold) params.set("onlySold", "true");
      if (nextFilters.minSoldCount != null && !Number.isNaN(nextFilters.minSoldCount)) {
        params.set("minSoldCount", String(nextFilters.minSoldCount));
      }
      if (nextFilters.search) params.set("search", nextFilters.search);
      const nextQuery = params.toString();
      const currentQuery = searchParams.toString();
      if (nextQuery === currentQuery) {
        return;
      }
      const newUrl = nextQuery ? `${pathname}?${nextQuery}` : pathname;
      router.replace(newUrl, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  const handleFiltersChange = useCallback(
    (next: FilterState) => {
      setFilters(next);
      applyFiltersToUrl(next);
    },
    [applyFiltersToUrl]
  );

  const handleFiltersReset = useCallback(() => {
    const empty: FilterState = {};
    setFilters(empty);
    applyFiltersToUrl(empty);
  }, [applyFiltersToUrl]);

  const apiFilterParams = useMemo(
    () => ({
      source: filters.source,
      city: filters.city,
      chain: filters.chain,
      district: filters.district,
      role: filters.role,
      propertyType: filters.propertyType,
      segment: filters.segment,
      priceBucket: filters.priceBucket,
      onlySold: filters.onlySold,
      minSoldCount: filters.minSoldCount,
      search: filters.search,
    }),
    [filters]
  );

  const { listings, isLoading: isListingsLoading } = useListings({
    source: filters.source,
    city: filters.city,
    chain: filters.chain,
    district: filters.district,
    role: filters.role,
    propertyType: filters.propertyType,
    segment: filters.segment,
    priceBucket: filters.priceBucket,
    onlySold: filters.onlySold,
    minSoldCount: filters.minSoldCount,
    search: filters.search,
  });
  const { meta } = useFilterMeta({
    source: filters.source,
    city: filters.city,
    chain: filters.chain,
    district: filters.district,
    role: filters.role,
    propertyType: filters.propertyType,
    segment: filters.segment,
    priceBucket: filters.priceBucket,
    onlySold: filters.onlySold,
    minSoldCount: filters.minSoldCount,
    search: filters.search,
  });
  const { metrics, isLoading: isMetricsLoading } = useMetrics({ window: "12m" });
  const { brokers } = useBrokerAgg(
    {
      source: filters.source,
      city: filters.city,
      chain: filters.chain,
      district: filters.district,
      role: filters.role,
      propertyType: filters.propertyType,
      segment: filters.segment,
      priceBucket: filters.priceBucket,
      onlySold: filters.onlySold,
      minSoldCount: filters.minSoldCount,
    },
    { window: "now", limit: 5, sort: "total_value" }
  );
  const { chains } = useChainAgg("now", 5);
  const { deltas } = useDeltaAgg(30, 10);
  const { brokers: commissionBrokers } = useCommissionBrokers(apiFilterParams, { window: "12m", limit: 50 });
  const { chains: commissionChains } = useCommissionChains("12m", 20);
  const { trends: commissionTrends } = useCommissionTrends(30, 5);
  const { districts: districtAgg } = useDistrictAgg(apiFilterParams, 3);

  const sources = meta?.sources ?? uniqueValues(listings, "source");
  const cities = meta?.cities ?? uniqueValues(listings, "city");
  const chainsList = meta?.chains ?? uniqueValues(listings, "chain");
  const propertyTypes = uniqueValues(listings, "property_type");
  const rolesFromMeta = meta?.roles ?? [];
  const roleOptions = rolesFromMeta.length ? rolesFromMeta : DEFAULT_ROLE_OPTIONS;
  const segments = (meta?.segments ?? uniqueValues(listings, "segment")).filter((item) => !!item);
  const priceBuckets = (meta?.price_buckets ?? uniqueValues(listings, "price_bucket")).filter((item) => !!item);
  const districts = useMemo(() => {
    if (meta?.districts && filters.city && meta.districts[filters.city]) {
      return meta.districts[filters.city];
    }
    return uniqueValues(listings, "district");
  }, [filters.city, listings, meta?.districts]);

  const soldCount = useMemo(() => countSold(listings), [listings]);
  const avgDays = useMemo(() => computeAverageDaysOnMarket(listings), [listings]);
  const { growing, falling } = useMemo(() => splitDeltas(deltas, 5), [deltas]);
  const commissionTrendMap = useMemo(() => {
    const map = new Map<string, number>();
    if (commissionTrends) {
      for (const entry of commissionTrends.growing) {
        const key = `${entry.broker ?? "ukjent"}::${entry.chain ?? ""}`;
        map.set(key, entry.delta);
      }
      for (const entry of commissionTrends.falling) {
        const key = `${entry.broker ?? "ukjent"}::${entry.chain ?? ""}`;
        map.set(key, entry.delta);
      }
    }
    return map;
  }, [commissionTrends]);

  const commissionGrowing = useMemo(() => {
    return commissionTrends?.growing.map((entry) => ({
      broker: entry.broker,
      chain: entry.chain,
      now_value: entry.now_total,
      prev_value: entry.prev_total,
      delta: entry.delta,
    }));
  }, [commissionTrends]);

  const commissionFalling = useMemo(() => {
    return commissionTrends?.falling.map((entry) => ({
      broker: entry.broker,
      chain: entry.chain,
      now_value: entry.now_total,
      prev_value: entry.prev_total,
      delta: entry.delta,
    }));
  }, [commissionTrends]);

  const topCommissionTotal = useMemo(() => commissionBrokers?.[0] ?? null, [commissionBrokers]);
  const topCommissionAverage = useMemo(() => {
    if (!commissionBrokers?.length) return null;
    return [...commissionBrokers].sort((a, b) => b.avg_commission - a.avg_commission)[0];
  }, [commissionBrokers]);
  const overallAvgCommission = useMemo(() => {
    if (!commissionBrokers?.length) return null;
    const totalListings = commissionBrokers.reduce((acc, item) => acc + item.listings, 0);
    const totalCommission = commissionBrokers.reduce((acc, item) => acc + item.total_commission, 0);
    if (!totalListings) return null;
    return Math.round(totalCommission / totalListings);
  }, [commissionBrokers]);

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div className="card-grid">
          <KpiCard
            title="Total Omsetning (12m)"
            value={isMetricsLoading || !metrics ? "…" : fmtCompactNOK(metrics.total_value)}
            subtitle="Samlet verdi av aktive oppføringer de siste 12 måneder."
          />
          <KpiCard
            title="Aktive Eiendomsmeglere"
            value={isMetricsLoading || !metrics ? "…" : metrics.active_agents.toLocaleString("no-NO")}
            subtitle="Registrerte meglere i valgte periode og filter."
          />
          <KpiCard
            title="Solgte Eiendommer (12m)"
            value={isListingsLoading ? "…" : soldCount || "—"}
            subtitle={soldCount ? "Gjennomførte salg i siste 12-måneders periode." : "Ingen solgte objekter registrert i valgt periode."}
          />
          <KpiCard
            title="Gjennomsnittlig Markedstid"
            value={avgDays ? `${avgDays} dager` : "—"}
            subtitle={avgDays ? "Beregnet fra publiseringsdato til siste registrering." : "Utilstrekkelig data for beregning av markedstid."}
          />
        </div>
      </section>

      <Filters
        sources={sources}
        cities={cities}
        chains={chainsList}
        propertyTypes={propertyTypes}
        districts={districts}
        roles={roleOptions}
        segments={segments}
        priceBuckets={priceBuckets}
        value={filters}
        onChange={handleFiltersChange}
        onReset={handleFiltersReset}
      />

      <section className="grid gap-4 lg:grid-cols-3">
        <AggTable title="Ledende Eiendomsmeglere" data={brokers} type="broker" />
        <AggTable title="Største Meglerkjeder" data={chains} type="chain" />
        <div className="space-y-4">
          <DeltaList title="Økende Aktivitet (30d)" data={growing} variant="growing" />
          <DeltaList title="Redusert Aktivitet (30d)" data={falling} variant="falling" />
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Provisjonsinntekter — Topprangerte</h2>
          <p className="text-xs text-muted-foreground">Beregnet provisjon basert på standardsats 1,25 prosent av omsetning.</p>
        </div>
        <div className="card-grid">
          <KpiCard
            title="Høyeste Totalprovisjon"
            value={topCommissionTotal ? fmtCompactNOK(topCommissionTotal.total_commission) : "—"}
            subtitle={topCommissionTotal ? (
              <span>
                <a 
                  href={`/broker/${slugify(topCommissionTotal.broker ?? "ukjent")}`}
                  className="hover:text-blue-400 hover:underline transition-colors"
                >
                  {topCommissionTotal.broker ?? "Ikke registrert"}
                </a>
                {` • ${topCommissionTotal.listings} transaksjoner`}
              </span>
            ) : "Data ikke tilgjengelig"}
          />
          <KpiCard
            title="Høyeste Gjennomsnittsprovisjon"
            value={topCommissionAverage ? fmtCompactNOK(topCommissionAverage.avg_commission) : "—"}
            subtitle={topCommissionAverage ? (
              <a 
                href={`/broker/${slugify(topCommissionAverage.broker ?? "ukjent")}`}
                className="hover:text-blue-400 hover:underline transition-colors"
              >
                {topCommissionAverage.broker ?? "Ikke registrert"}
              </a>
            ) : "Data ikke tilgjengelig"}
          />
          <KpiCard
            title="Gjennomsnitt per Oppføring"
            value={overallAvgCommission ? fmtCompactNOK(overallAvgCommission) : "—"}
            subtitle="Beregnet på grunnlag av siste 12-måneders periode."
          />
          <KpiCard
            title="Ledende Meglerkjede"
            value={commissionChains && commissionChains[0] ? fmtCompactNOK(commissionChains[0].total_commission) : "—"}
            subtitle={commissionChains && commissionChains[0] ? commissionChains[0].chain ?? "Ikke registrert" : "Data ikke tilgjengelig"}
          />
        </div>

        <div className="space-y-6">
          <CommissionTable data={commissionBrokers} trendMap={commissionTrendMap} />
          
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <CommissionBarChart data={commissionBrokers} />
            </div>
            <div className="space-y-4">
              <DeltaList title="Økning i Provisjonsinntekter" data={commissionGrowing} variant="growing" />
              <DeltaList title="Reduksjon i Provisjonsinntekter" data={commissionFalling} variant="falling" />
            </div>
          </div>
        </div>
       {districtAgg && districtAgg.length ? (
          <div className="rounded-lg border border-border/60 bg-card/40 p-4">
            <h3 className="pb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Markedsområder i {filters.city ?? "Oslo"}
            </h3>
            <p className="pb-3 text-xs text-muted-foreground">
              Provisjonsanalyse per geografisk område med de tre ledende eiendomsmeglerne i valgt segment.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {districtAgg.map((district) => (
                <div key={district.district} className="rounded-lg border border-border/60 bg-card/20 p-3">
                  <div className="text-sm font-semibold text-foreground">{district.district}</div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    {district.brokers.slice(0, 3).map((broker) => (
                      <div key={`${district.district}-${broker.broker ?? "ukjent"}`} className="flex items-center justify-between">
                        <a 
                          href={`/broker/${slugify(broker.broker ?? "ukjent")}`}
                          className="truncate pr-2 hover:text-blue-400 hover:underline transition-colors"
                        >
                          {broker.broker ?? "Ukjent"}
                        </a>
                        <span>{fmtCompactNOK(broker.total_commission)}</span>
                      </div>
                    ))}
                    {!district.brokers.length && <div>Ingen registrerte transaksjoner</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Detaljert Transaksjonsoversikt</h2>
          <span className="text-xs text-muted-foreground">
            Datakilde: {filters.source ?? "Hjem.no + DNB Eiendom"} • Filter anvendt i sanntid
          </span>
        </div>
        <ListingsTable listings={listings} />
      </section>
    </div>
  );
}

export default function OverviewPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <OverviewPageContent />
    </Suspense>
  );
}
