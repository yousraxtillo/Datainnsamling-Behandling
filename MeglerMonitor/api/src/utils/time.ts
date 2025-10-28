export function parseWindow(window: string, fallbackDays = 365): number {
  const match = /^(\d+)([dmy])$/i.exec(window);
  if (!match) {
    return fallbackDays;
  }
  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  if (Number.isNaN(value)) {
    return fallbackDays;
  }
  switch (unit) {
    case "d":
      return value;
    case "m":
      return value * 30;
    case "y":
      return value * 365;
    default:
      return fallbackDays;
  }
}

export function shiftDate(asOf: Date, days: number): Date {
  const copy = new Date(asOf.getTime());
  copy.setUTCDate(copy.getUTCDate() - days);
  return copy;
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
