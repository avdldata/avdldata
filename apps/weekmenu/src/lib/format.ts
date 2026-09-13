import type { Cents } from '@/domain/units';
import type { BaseUnit } from '@/domain/units';

const euroFormatter = new Intl.NumberFormat('nl-NL', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
});

const numberFormatter = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 1 });

/** The single place where integer cents turn into "€ 12,34". */
export function formatEuro(value: Cents | number): string {
  return euroFormatter.format(value / 100);
}

/** Signed amount, for price deltas: "+ € 1,20" / "− € 0,80". */
export function formatEuroDelta(value: Cents | number): string {
  if (value === 0) return 'zelfde prijs';
  const sign = value > 0 ? '+ ' : '− ';
  return `${sign}${euroFormatter.format(Math.abs(value) / 100)}`;
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function formatDistance(km: number): string {
  return `${numberFormatter.format(km)} km`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return rest === 0 ? `${hours} uur` : `${hours} uur ${rest} min`;
}

/** Human-readable amount in the ingredient's own unit. */
export function formatQuantity(amount: number, unit: BaseUnit): string {
  if (unit === 'piece') {
    const rounded = Math.round(amount * 4) / 4;
    return `${numberFormatter.format(rounded)} ${rounded === 1 ? 'stuk' : 'stuks'}`;
  }
  if (unit === 'g' && amount >= 1000) return `${numberFormatter.format(amount / 1000)} kg`;
  if (unit === 'ml' && amount >= 1000) return `${numberFormatter.format(amount / 1000)} l`;
  return `${Math.round(amount)} ${unit}`;
}

export function formatPackage(amount: number, unit: BaseUnit): string {
  return formatQuantity(amount, unit);
}

const WEEKDAYS = [
  'Maandag',
  'Dinsdag',
  'Woensdag',
  'Donderdag',
  'Vrijdag',
  'Zaterdag',
  'Zondag',
] as const;

export function weekdayName(dayIndex: number): string {
  return WEEKDAYS[dayIndex % 7] ?? 'Dag';
}

export function weekdayShort(dayIndex: number): string {
  return weekdayName(dayIndex).slice(0, 2);
}

export function formatDayDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(date);
}

export function formatWeekRange(startDate: string): string {
  const start = new Date(`${startDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return '';
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const fmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

export const CATEGORY_LABELS: Record<string, string> = {
  'groente-fruit': 'Groente & fruit',
  'vlees-vis-vega': 'Vlees, vis & vervangers',
  zuivel: 'Zuivel',
  'brood-granen': 'Brood & granen',
  conserven: 'Conserven',
  'kruiden-specerijen': 'Kruiden & voorraad',
  overig: 'Overig',
};

/** The order a Dutch supermarket is actually walked. */
export const CATEGORY_ORDER = [
  'groente-fruit',
  'vlees-vis-vega',
  'zuivel',
  'brood-granen',
  'conserven',
  'kruiden-specerijen',
  'overig',
] as const;
