import Link from "next/link";
import { notFound } from "next/navigation";

import { fetchBrokerDetail } from "@/lib/api";
import { fmtCompactNOK, fmtNOK, slugify } from "@/lib/utils";

type ListingSnapshot = {
  city: string | null;
  commission_est: number | null;
  price: number | null;
  snapshot_at: string;
  published: string | null;
  status: string | null;
};

function parseDate(value?: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatExperienceDuration(years: number | null): string | null {
  if (years == null || Number.isNaN(years)) {
    return null;
  }
  if (years >= 1) {
    if (years >= 10) {
      return `${Math.round(years).toLocaleString("no-NO")} år`;
    }
    return `${years.toLocaleString("no-NO", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} år`;
  }
  const months = Math.max(1, Math.round(years * 12));
  return `${months.toLocaleString("no-NO")} mnd`;
}

function toRoleBadges(roles: Record<string, number>) {
  return Object.entries(roles)
    .filter(([, count]) => count > 0)
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count);
}

function summarizeListings(listings: ListingSnapshot[]) {
  const cityMap = new Map<string, number>();
  const prices: number[] = [];

  const now = new Date();
  const nowWindowStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const prevWindowStart = new Date(nowWindowStart.getTime() - 90 * 24 * 60 * 60 * 1000);

  let nowValue = 0;
  let prevValue = 0;
  let soldCount = 0;

  for (const listing of listings) {
    if (listing.city) {
      cityMap.set(listing.city, (cityMap.get(listing.city) ?? 0) + 1);
    }
    if (listing.price != null) {
      prices.push(listing.price);
    }
    if ((listing.status ?? "").toLowerCase() === "sold") {
      soldCount += 1;
    }

    const referenceDate = parseDate(listing.snapshot_at) ?? parseDate(listing.published);
    if (!referenceDate) continue;

    const commission = listing.commission_est ?? 0;
    if (referenceDate >= nowWindowStart) {
      nowValue += commission;
    } else if (referenceDate >= prevWindowStart && referenceDate < nowWindowStart) {
      prevValue += commission;
    }
  }

  const cityBreakdown = [...cityMap.entries()]
    .map(([city, count]) => ({ city, listings: count }))
    .sort((a, b) => b.listings - a.listings);

  prices.sort((a, b) => a - b);
  let median: number | null = null;
  if (prices.length) {
    const mid = Math.floor(prices.length / 2);
    median =
      prices.length % 2 === 0
        ? Math.round((prices[mid - 1] + prices[mid]) / 2)
        : prices[mid];
  }

  const priceStats = prices.length
    ? {
        min: prices[0],
        median,
        max: prices[prices.length - 1],
      }
    : { min: null, median: null, max: null };

  const hasValues = nowValue > 0 || prevValue > 0;
  const ninetyDay = hasValues
    ? { now: nowValue, prev: prevValue, diff: nowValue - prevValue }
    : { now: null, prev: null, diff: null };

  return { cityBreakdown, priceStats, ninetyDay, soldCount };
}

export default async function BrokerPage({ params }: { params: { slug: string } }) {
  let detail;
  try {
    detail = await fetchBrokerDetail(params.slug);
  } catch (error) {
    if ((error as { status?: number }).status === 404) {
      notFound();
    }
    throw error;
  }

  const roleBadges = toRoleBadges(detail.summary.roles);
  const propertyBreakdown = [...detail.property_breakdown].sort((a, b) => b.listings - a.listings);
  const districtBreakdown = [...detail.district_breakdown].sort((a, b) => b.listings - a.listings);
  const focusSegment = propertyBreakdown[0];
  const segmentInsight = propertyBreakdown.slice(0, 2);
  const areaInsight = districtBreakdown.slice(0, 2);

  const listingSummary = summarizeListings(
    detail.listings.map((listing) => ({
      city: listing.city,
      commission_est: listing.commission_est,
      price: listing.price,
      snapshot_at: listing.snapshot_at,
      published: listing.published,
      status: listing.status,
    }))
  );

  // TODO: Add experience_level and experience_years to BrokerSummary interface
  // const experienceLevel = detail.summary.experience_level;
  // const experienceDuration = formatExperienceDuration(detail.summary.experience_years);
  // const experienceStart = detail.summary.first_seen ? parseDate(detail.summary.first_seen) : null;

  const highVolume = detail.summary.total_commission >= 15_000_000 || detail.summary.listings >= 75;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950 via-slate-950/80 to-slate-900/70 p-8 text-slate-100 shadow-2xl backdrop-blur">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/5 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-semibold text-white">{detail.summary.broker ?? "Ukjent megler"}</h1>
              {highVolume ? (
                <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">Høyvolum</span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-slate-300">
              {detail.summary.chain ?? "Ukjent kjede"} · {detail.summary.listings.toLocaleString("no-NO")} objekter
            </p>
            <p className="text-xs text-slate-400">
              Fokuserer primært på {focusSegment?.label?.toLowerCase() ?? "ukjent segment"} i{" "}
              {districtBreakdown[0]?.label ?? listingSummary.cityBreakdown[0]?.city ?? "flere områder"}.
            </p>
            {roleBadges.length ? (
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                {roleBadges.map(({ role, count }) => (
                  <span key={role} className="rounded-full border border-white/10 px-3 py-1">
                    {role} · {count}
                  </span>
                ))}
              </div>
            ) : null}
            {detail.rank != null && detail.total_brokers != null ? (
              <p className="mt-3 text-xs text-slate-400">
                Rangert som #{detail.rank} av {detail.total_brokers} meglere basert på provisjon siste 12 måneder.
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 text-right text-sm text-slate-200">
            <div>
              <span className="block text-xs uppercase text-slate-500">Samlet verdi</span>
              <span className="text-xl font-semibold text-white">{fmtCompactNOK(detail.summary.total_price)}</span>
            </div>
            <div>
              <span className="block text-xs uppercase text-slate-500">Estimert provisjon</span>
              <span className="text-xl font-semibold text-white">{fmtCompactNOK(detail.summary.total_commission)}</span>
            </div>
            <div>
              <span className="block text-xs uppercase text-slate-500">Erfaring</span>
              <span className="text-base font-medium text-white">Ikke tilgjengelig</span>
              <p className="text-xs text-slate-400">
                Ingen historikk registrert
              </p>
            </div>
          </div>
        </header>

        <section className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
            <p className="text-xs uppercase text-slate-400">Fokussement</p>
            <p className="mt-1 text-lg font-semibold text-white">{focusSegment?.label ?? "Ukjent"}</p>
            <p className="text-xs text-slate-400">
              {focusSegment ? `${focusSegment.listings.toLocaleString("no-NO")} registrerte objekter` : "Ingen data"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
            <p className="text-xs uppercase text-slate-400">Segmentinnsikt</p>
            <p className="mt-1 text-sm text-slate-200">
              {segmentInsight.length
                ? segmentInsight
                    .map((segment) => `${segment.label ?? "Ukjent"} (${segment.listings.toLocaleString("no-NO")})`)
                    .join(", ")
                : "Ingen data"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
            <p className="text-xs uppercase text-slate-400">Områdeinnsikt</p>
            <p className="mt-1 text-sm text-slate-200">
              {areaInsight.length
                ? areaInsight
                    .map((district) => `${district.label ?? "Ukjent"} (${district.listings.toLocaleString("no-NO")})`)
                    .join(", ")
                : "Ingen data"}
            </p>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-white/5 bg-white/10 px-4 py-4">
            <p className="text-xs uppercase text-slate-400">Totalt salg</p>
            <p className="mt-1 text-2xl font-semibold text-white">{detail.summary.listings.toLocaleString("no-NO")}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/10 px-4 py-4">
            <p className="text-xs uppercase text-slate-400">Samlet verdi</p>
            <p className="mt-1 text-2xl font-semibold text-white">{fmtCompactNOK(detail.summary.total_price)}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/10 px-4 py-4">
            <p className="text-xs uppercase text-slate-400">Snittpris</p>
            <p className="mt-1 text-2xl font-semibold text-white">{fmtNOK(detail.summary.avg_price)}</p>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/10 px-4 py-4">
            <p className="text-xs uppercase text-slate-400">Estimert provisjon</p>
            <p className="mt-1 text-2xl font-semibold text-white">{fmtCompactNOK(detail.summary.total_commission)}</p>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
            <h2 className="text-sm font-semibold text-white">Segmenter</h2>
            <div className="mt-3 space-y-2">
              {propertyBreakdown.slice(0, 8).map((row) => (
                <div key={row.label ?? "ukjent"} className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2 text-sm text-slate-200">
                  <span>{row.label ?? "Ukjent"}</span>
                  <span>{row.listings.toLocaleString("no-NO")}</span>
                </div>
              ))}
              {!propertyBreakdown.length && <p className="text-xs text-slate-400">Ingen data</p>}
            </div>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
            <h2 className="text-sm font-semibold text-white">Lokasjoner</h2>
            <div className="mt-3 space-y-2">
              {listingSummary.cityBreakdown.slice(0, 10).map((row) => (
                <div key={row.city} className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2 text-sm text-slate-200">
                  <span>{row.city}</span>
                  <span>{row.listings.toLocaleString("no-NO")}</span>
                </div>
              ))}
              {listingSummary.cityBreakdown.length > 10 ? (
                <p className="text-xs text-slate-400">
                  Vis alle ({(listingSummary.cityBreakdown.length - 10).toLocaleString("no-NO")} flere)
                </p>
              ) : null}
              {!listingSummary.cityBreakdown.length && <p className="text-xs text-slate-400">Ingen data</p>}
            </div>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
            <h2 className="text-sm font-semibold text-white">Prisnivå</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-200">
              <div className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2">
                <span>Min</span>
                <span>{listingSummary.priceStats.min != null ? fmtNOK(listingSummary.priceStats.min) : "—"}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2">
                <span>Median</span>
                <span>{listingSummary.priceStats.median != null ? fmtNOK(listingSummary.priceStats.median) : "—"}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2">
                <span>Maks</span>
                <span>{listingSummary.priceStats.max != null ? fmtNOK(listingSummary.priceStats.max) : "—"}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
            <h2 className="text-sm font-semibold text-white">Topp bydeler</h2>
            <div className="mt-3 space-y-2">
              {districtBreakdown.slice(0, 6).map((row) => (
                <div key={row.label ?? "ukjent"} className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2 text-sm text-slate-200">
                  <span>{row.label ?? "Ukjent"}</span>
                  <span>{fmtCompactNOK(row.total_commission)}</span>
                </div>
              ))}
              {!districtBreakdown.length && <p className="text-xs text-slate-400">Ingen data</p>}
            </div>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
            <h2 className="text-sm font-semibold text-white">Utvikling siste 90 dager</h2>
            {listingSummary.ninetyDay.now != null ? (
              <div className="mt-3 space-y-3 text-sm text-slate-200">
                <p>
                  Nå: <span className="font-semibold text-white">{fmtCompactNOK(listingSummary.ninetyDay.now)}</span>
                </p>
                <p>
                  Tidligere:{" "}
                  <span className="font-semibold text-white">
                    {fmtCompactNOK(Math.max(listingSummary.ninetyDay.prev ?? 0, 0))}
                  </span>
                </p>
                <p
                  className={`text-sm font-semibold ${
                    (listingSummary.ninetyDay.diff ?? 0) >= 0 ? "text-emerald-300" : "text-rose-300"
                  }`}
                >
                  {(listingSummary.ninetyDay.diff ?? 0) >= 0 ? "+" : ""}
                  {fmtCompactNOK(listingSummary.ninetyDay.diff ?? 0)}
                </p>
              </div>
            ) : (
              <p className="mt-3 text-xs text-slate-400">Ingen tidsserie tilgjengelig.</p>
            )}
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
            <h2 className="text-sm font-semibold text-white">Snitt & provisjon</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-200">
              <div className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2">
                <span>Snittpris</span>
                <span>{fmtNOK(detail.summary.avg_price)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2">
                <span>Snitt provisjon</span>
                <span>{fmtNOK(detail.summary.avg_commission)}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-black/30 px-3 py-2">
                <span>Solgte objekter</span>
                <span>{listingSummary.soldCount.toLocaleString("no-NO")}</span>
              </div>
            </div>
          </div>
        </section>

        <section className="mt-8 grid gap-6 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
            <h2 className="text-sm font-semibold text-white">Peers</h2>
            <p className="text-xs text-slate-400">Meglere i samme segment og område.</p>
            <div className="mt-3 space-y-2">
              {detail.peers.length ? (
                detail.peers.map((peer) => {
                  const key = `${peer.broker ?? "ukjent"}-${peer.chain ?? ""}`;
                  const content = (
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-black/25 px-3 py-2 text-sm text-slate-200 transition hover:bg-black/40">
                      <div>
                        <div className="font-semibold text-white">{peer.broker ?? "Ukjent"}</div>
                        <div className="text-xs text-slate-400">
                          {peer.chain ?? "Ukjent kjede"} · {peer.listings} objekt(er)
                        </div>
                      </div>
                      <div className="text-right text-sm font-semibold text-emerald-300">
                        {fmtCompactNOK(peer.total_commission)}
                      </div>
                    </div>
                  );
                  return peer.broker ? (
                    <Link key={key} href={`/broker/${slugify(peer.broker)}`}>
                      {content}
                    </Link>
                  ) : (
                    <div key={key}>{content}</div>
                  );
                })
              ) : (
                <p className="text-xs text-slate-400">Ingen relevante kolleger funnet.</p>
              )}
            </div>
          </div>
          <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
            <h2 className="text-sm font-semibold text-white">Du vil også like</h2>
            <p className="text-xs text-slate-400">Andre toppmeglere i samme kjede.</p>
            <div className="mt-3 space-y-2">
              {detail.recommendations.length ? (
                detail.recommendations.map((peer) => {
                  const key = `${peer.broker ?? "ukjent"}-${peer.chain ?? ""}`;
                  const content = (
                    <div className="flex items-center justify-between gap-3 rounded-xl bg-black/25 px-3 py-2 text-sm text-slate-200 transition hover:bg-black/40">
                      <div>
                        <div className="font-semibold text-white">{peer.broker ?? "Ukjent"}</div>
                        <div className="text-xs text-slate-400">{peer.chain ?? "Ukjent kjede"}</div>
                      </div>
                      <div className="text-right text-sm font-semibold text-emerald-300">
                        {fmtCompactNOK(peer.total_commission)}
                      </div>
                    </div>
                  );
                  return peer.broker ? (
                    <Link key={key} href={`/broker/${slugify(peer.broker)}`}>
                      {content}
                    </Link>
                  ) : (
                    <div key={key}>{content}</div>
                  );
                })
              ) : (
                <p className="text-xs text-slate-400">Ingen anbefalinger tilgjengelig.</p>
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
