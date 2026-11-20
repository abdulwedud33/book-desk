// tools.ts
// Tool definitions and execution engine for staff assistant agents.
// Complies with docs/tools.md and docs/guardrails.md.

export interface ServiceItem {
  id: string;
  name: string;
  duration_min: number;
  price: number | null;
}

export interface ProviderItem {
  id: string;
  name: string;
}

export interface CustomerItem {
  id: string;
  name: string;
}

export interface SlotItem {
  start: string;
  provider_id: string;
  provider_name?: string;
  label: string;
}

export interface ShopMemoryItem {
  id: string;
  kind: 'alias' | 'preference' | 'fact';
  key: string;
  value: string;
  ref_id: string | null;
}

export interface BookingMessageDetails {
  booking_id: string;
  business_name: string;
  service_name: string;
  provider_name: string;
  customer_first_name: string;
  date_time_words: string;
  ethiopian_words?: string;
  cutoff_hours: number;
  status: string;
}

export interface DashboardSummaryData {
  period: string;
  total_bookings: number;
  completed_bookings: number;
  confirmed_bookings: number;
  no_show_bookings: number;
  cancelled_bookings: number;
  completed_revenue_cents: number;
  new_customers_count: number;
  no_show_rate: number;
  cancellation_rate: number;
}
