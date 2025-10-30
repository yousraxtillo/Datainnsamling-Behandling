import useSWR from "swr";

// For client-side calls (browser)
const CLIENT_API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "https://meglermonitor-api.onrender.com";

// For server-side rendering (SSR), we might have a different internal URL  
const SERVER_API_BASE = process.env.API_BASE ?? process.env.NEXT_PUBLIC_API_BASE ?? "https://meglermonitor-api.onrender.com";

// Function to get the right API base depending on environment
function getApiBase(): string {
  // Check if we're running on the server (no window object)
  if (typeof window === 'undefined') {
    return SERVER_API_BASE;
  }
  return CLIENT_API_BASE;
}

export interface Listing {
  source: "Hjem.no" | "DNB";
  listing_id: string;
  title: string | null;
  address: string | null;
  city: string | null;
  district: string | null;
  chain: string | null;
  broker: string | null;
  price: number | null;
  commission_est: number | null;
  status: string | null;
  published: string | null;
  property_type: string | null;
  segment: string | null;
  price_bucket: string | null;
  broker_role: string | null;
  role: string | null;
  is_sold: boolean | null;
  last_seen_at: string;
  snapshot_at: string;
}

export interface Metrics {
  as_of: string;
  total_value: number;
  active_agents: number;
}

export interface BrokerAggregate {
  broker: string | null;
  chain: string | null;
  role: string | null;
  count_active: number;
  count_sold: number;
  count: number;
  total_value: number;
  avg_value: number;
}

export interface ChainAggregate {
  chain: string | null;
  total_value: number;
  count: number;
  avg_value: number;
}

export interface DeltaAggregate {
  broker: string | null;
  chain: string | null;
  now_value: number;
  prev_value: number;
  delta: number;
}

export interface CommissionBrokerAggregate {
  broker: string | null;
  chain: string | null;
  listings: number;
  total_commission: number;
  avg_commission: number;
}

export interface CommissionChainAggregate {
  chain: string | null;
  listings: number;
  total_commission: number;
  avg_commission: number;
}

export interface CommissionTrendEntry {
  broker: string | null;
  chain: string | null;
  now_total: number;
  prev_total: number;
  delta: number;
}

export interface CommissionTrendResponse {
  growing: CommissionTrendEntry[];
  falling: CommissionTrendEntry[];
}

export interface BrokerSummary {
  broker: string | null;
  chain: string | null;
  listings: number;
  total_price: number;
  avg_price: number;
  total_commission: number;
  avg_commission: number;
  roles: Record<string, number>;
}

export interface BreakdownRow {
  label: string | null;
  listings: number;
  total_price: number;
  total_commission: number;
}

export interface TrendPoint {
  period: string;
  total_commission: number;
}

export interface BrokerPeerSummary {
  broker: string | null;
  chain: string | null;
  listings: number;
  total_commission: number;
  avg_price: number;
}

export interface BrokerDetail {
  summary: BrokerSummary;
  property_breakdown: BreakdownRow[];
  district_breakdown: BreakdownRow[];
  commission_trend: TrendPoint[];
  listings: Listing[];
  peers: BrokerPeerSummary[];
  recommendations: BrokerPeerSummary[];
  rank: number | null;
  total_brokers: number | null;
}

export interface DistrictAggregate {
  district: string;
  brokers: CommissionBrokerAggregate[];
  chains: CommissionChainAggregate[];
}

export interface FilterMeta {
  cities: string[];
  districts: Record<string, string[]>;
  roles: string[];
  segments: string[];
  price_buckets: string[];
  chains: string[];
  sources: string[];
}

function useApiSWR<T>(path: string) {
  return useSWR<T, Error>(path, async (url: string) => {
    const res = await fetch(`${getApiBase()}${url}`, {
      next: { revalidate: 60 },
    });
    if (!res.ok) {
      throw new Error(`Failed request: ${res.status}`);
    }
    return (await res.json()) as T;
  });
}

function buildQuery(params: Record<string, string | undefined | null>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      query.set(key, value);
    }
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

type ListingFilterParams = {
  source?: string;
  city?: string;
  chain?: string;
  district?: string;
  role?: string;
  propertyType?: string;
  segment?: string;
  priceBucket?: string;
  priceMin?: number;
  priceMax?: number;
  onlySold?: boolean;
  minSoldCount?: number;
  search?: string;
};

function listingFilterRecord(params: ListingFilterParams): Record<string, string | undefined> {
  return {
    source: params.source,
    city: params.city,
    chain: params.chain,
    district: params.district,
    role: params.role,
    property_type: params.propertyType,
    segment: params.segment,
    price_bucket: params.priceBucket,
    price_min: params.priceMin != null ? String(params.priceMin) : undefined,
    price_max: params.priceMax != null ? String(params.priceMax) : undefined,
    only_sold: params.onlySold ? "true" : undefined,
    min_sold_count: params.minSoldCount != null ? String(params.minSoldCount) : undefined,
    search: params.search,
  };
}

function buildListingQuery(params: ListingFilterParams) {
  return buildQuery(listingFilterRecord(params));
}

export function useListings(params: ListingFilterParams & { since?: string; until?: string }) {
  const { since, until, ...filters } = params;
  const qs = buildQuery({
    ...listingFilterRecord(filters),
    since,
    until,
  });
  const { data, error, isLoading } = useApiSWR<Listing[]>(`/api/listings${qs}`);
  const filtered = data?.filter((listing) => {
    if (filters.search) {
      const term = filters.search.toLowerCase();
      return (
        listing.title?.toLowerCase().includes(term) ||
        listing.address?.toLowerCase().includes(term) ||
        listing.broker?.toLowerCase().includes(term) ||
        listing.city?.toLowerCase().includes(term)
      );
    }
    return true;
  });
  return {
    listings: filtered,
    isLoading,
    isError: Boolean(error),
  };
}

export function useMetrics(params: { asOf?: string; window?: string }) {
  const qs = buildQuery({
    asOf: params.asOf,
    window: params.window,
  });
  const { data, error, isLoading } = useApiSWR<Metrics>(`/api/metrics${qs}`);
  return {
    metrics: data,
    isLoading,
    isError: Boolean(error),
  };
}

export function useBrokerAgg(filters: ListingFilterParams, options?: { window?: string; limit?: number; sort?: "total_value" | "avg_value" | "count_sold" | "count_active" }) {
  const qs = buildQuery({
    window: options?.window ?? "now",
    limit: options?.limit != null ? String(options.limit) : undefined,
    sort: options?.sort,
    ...listingFilterRecord(filters),
  });
  const { data, error, isLoading } = useApiSWR<BrokerAggregate[]>(`/api/agg/brokers${qs}`);
  return { brokers: data, isLoading, isError: Boolean(error) };
}

export function useChainAgg(window = "now", limit = 5) {
  const qs = buildQuery({ window, limit: String(limit) });
  const { data, error, isLoading } = useApiSWR<ChainAggregate[]>(`/api/agg/chains${qs}`);
  return { chains: data, isLoading, isError: Boolean(error) };
}

export function useDeltaAgg(nowDays = 30, limit = 5) {
  const qs = buildQuery({ nowDays: String(nowDays), limit: String(limit) });
  const { data, error, isLoading } = useApiSWR<DeltaAggregate[]>(`/api/agg/deltas${qs}`);
  return { deltas: data, isLoading, isError: Boolean(error) };
}

export function useCommissionBrokers(filters: ListingFilterParams, options?: { window?: string; limit?: number }) {
  const qs = buildQuery({
    window: options?.window ?? "12m",
    limit: options?.limit != null ? String(options.limit) : undefined,
    ...listingFilterRecord(filters),
  });
  const { data, error, isLoading } = useApiSWR<CommissionBrokerAggregate[]>(`/api/agg/commissions/brokers${qs}`);
  return { brokers: data, isLoading, isError: Boolean(error) };
}

export function useCommissionChains(window = "12m", limit = 10) {
  const qs = buildQuery({ window, limit: String(limit) });
  const { data, error, isLoading } = useApiSWR<CommissionChainAggregate[]>(`/api/agg/commissions/chains${qs}`);
  return { chains: data, isLoading, isError: Boolean(error) };
}

export function useCommissionTrends(nowDays = 30, limit = 5) {
  const qs = buildQuery({ nowDays: String(nowDays), limit: String(limit) });
  const { data, error, isLoading } = useApiSWR<CommissionTrendResponse>(`/api/agg/commissions/trends${qs}`);
  return { trends: data, isLoading, isError: Boolean(error) };
}

export function useDistrictAgg(filters: ListingFilterParams & { city?: string }, limit = 5) {
  const qs = buildQuery({
    city: filters.city ?? "Oslo",
    limit: String(limit),
    ...listingFilterRecord(filters),
  });
  const { data, error, isLoading } = useApiSWR<DistrictAggregate[]>(`/api/agg/districts${qs}`);
  return { districts: data, isLoading, isError: Boolean(error) };
}

export function useFilterMeta(filters: ListingFilterParams) {
  const qs = buildListingQuery(filters);
  const { data, error, isLoading } = useApiSWR<FilterMeta>(`/api/meta/filters${qs}`);
  return { meta: data, isLoading, isError: Boolean(error) };
}

export async function fetchBrokerDetail(slug: string, params?: { chain?: string; since?: string; until?: string }) {
  const qs = buildQuery({
    chain: params?.chain,
    since: params?.since,
    until: params?.until,
  });
  const res = await fetch(`${getApiBase()}/api/broker/${encodeURIComponent(slug)}${qs}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    const error = new Error(`Failed to fetch broker detail (${res.status})`);
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }
  return (await res.json()) as BrokerDetail;
}
