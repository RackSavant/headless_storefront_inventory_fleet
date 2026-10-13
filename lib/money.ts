import type { Product } from "./types";

export function formatMoney(cents: number, currency: Product["currency"] = "USD"): string {
  const value = (cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
  return currency === "USDC" ? `${value} USDC` : `$${value}`;
}

export function moneyTotals(items: Array<{ price_cents: number; currency: Product["currency"] }>) {
  const totals = new Map<Product["currency"], number>();
  for (const item of items) totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.price_cents);
  return [...totals].map(([currency, price_cents]) => ({ currency, price_cents }));
}

export function formatTotals(items: Array<{ price_cents: number; currency: Product["currency"] }>): string {
  return moneyTotals(items).map((item) => formatMoney(item.price_cents, item.currency)).join(" + ") || "$0";
}
