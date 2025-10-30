// Fallback sample data for when API is unreachable
export const FALLBACK_METRICS = {
  as_of: "2025-10-29T08:00:00Z",
  active_agents: 2196,
  total_value: 67400000000,
  sold_count: 245,
  avg_days_on_market: 42
};

export const FALLBACK_LISTINGS = [
  {
    source: "DNB" as const,
    listing_id: "D001",
    title: "Eksklusiv penthouse med panoramautsikt over Oslofjorden",
    address: "Aker Brygge 1",
    city: "Oslo",
    district: "Sentrum",
    chain: "DNB Eiendom",
    broker: "Magnus Eriksen",
    price: 45800000,
    commission_est: 572500,
    status: "available",
    published: "2025-10-29T09:30:00+02:00",
    property_type: "Leilighet",
    segment: "Premium",
    price_bucket: "40M-50M",
    broker_role: "Eiendomsmegler",
    role: "Eiendomsmegler",
    is_sold: false,
    last_seen_at: "2025-10-29T08:00:00Z",
    snapshot_at: "2025-10-29T08:00:00Z"
  },
  {
    source: "Hjem.no" as const,
    listing_id: "H002", 
    title: "Spektakulær arkitekttegnet villa på Bygdøy",
    address: "Bygdøy allé 28",
    city: "Oslo",
    district: "Bygdøy",
    chain: "Eiendomsmegler 1",
    broker: "Astrid Lindberg",
    price: 89200000,
    commission_est: 1115000,
    status: "available",
    published: "2025-10-29T10:15:00+02:00",
    property_type: "Enebolig",
    segment: "Luxury",
    price_bucket: "80M+",
    broker_role: "Eiendomsmegler", 
    role: "Eiendomsmegler",
    is_sold: false,
    last_seen_at: "2025-10-29T08:00:00Z",
    snapshot_at: "2025-10-29T08:00:00Z"
  }
  // Add more sample listings as needed
];