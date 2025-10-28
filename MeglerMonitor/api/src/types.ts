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

export interface PeerSummary {
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
  peers: PeerSummary[];
  recommendations: PeerSummary[];
  rank: number | null;
  total_brokers: number | null;
}

export interface DistrictAggregate {
  district: string;
  brokers: CommissionBrokerAggregate[];
  chains: CommissionChainAggregate[];
}
