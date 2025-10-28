import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const fmtNOK = (n: number) =>
  new Intl.NumberFormat("no-NO", {
    style: "currency",
    currency: "NOK",
    maximumFractionDigits: 0,
  }).format(n);

const formatWithUnit = (value: number, divisor: number, unit: string) => {
  const scaled = value / divisor;
  const absScaled = Math.abs(scaled);
  const maximumFractionDigits = absScaled >= 100 ? 0 : absScaled >= 10 ? 1 : 2;
  const formatted = new Intl.NumberFormat("no-NO", {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(scaled);
  return `${formatted} ${unit} kr`;
};

export const fmtCompactNOK = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) {
    return formatWithUnit(n, 1_000_000_000, "mrd.");
  }
  if (abs >= 1_000_000) {
    return formatWithUnit(n, 1_000_000, "mill.");
  }
  return fmtNOK(n);
};

export const fmtMaybeCompactNOK = (n: number) =>
  Math.abs(n) >= 1_000_000 ? fmtCompactNOK(n) : fmtNOK(n);

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}
