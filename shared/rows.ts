import { applyPremium } from './rates';
import type { DailyRate, Metal, Purity, RateProvider } from './types';

/** Firestore collection with five rows per day, one per metal and purity. */
export const PURITY_ROWS_COLLECTION = 'daily_rate_rows';

/** One row of `daily_rate_rows/{YYYY-MM-DD}_{metal}_{purity}`. */
export interface PurityRateRow {
  rate_date: string;
  metal: Metal;
  purity: Purity;
  /** The real price from the API (IBJA), ₹ per gram, converted to this purity. */
  api_price: number;
  /** Market premium (%) in effect when the job ran. */
  premium_pct: number;
  /** `api_price` + premium, ₹ per gram. */
  market_price: number;
  usd_inr: number | null;
  source: RateProvider;
  benchmark: string;
  /** ISO here; a Firestore timestamp in the database. */
  rate_time: string | null;
  created_at: string;
}

const PURITIES: Array<[Metal, Purity, 'gold_24k' | 'gold_22k' | 'gold_18k' | 'silver_999' | 'silver_925']> = [
  ['gold', '24K', 'gold_24k'],
  ['gold', '22K', 'gold_22k'],
  ['gold', '18K', 'gold_18k'],
  ['silver', '999', 'silver_999'],
  ['silver', '925', 'silver_925'],
];

/** Document id of a row: `2026-11-16_gold_22K`. */
export const purityRowId = (date: string, metal: Metal, purity: Purity) => `${date}_${metal}_${purity}`;

/** Splits a day's row into its five purity rows. */
export function toPurityRows(day: DailyRate): Array<{ id: string; row: PurityRateRow }> {
  const premium = { gold_pct: day.premium_gold_pct ?? 0, silver_pct: day.premium_silver_pct ?? 0 };
  const market = applyPremium(day, premium);
  return PURITIES.map(([metal, purity, field]) => ({
    id: purityRowId(day.rate_date, metal, purity),
    row: {
      rate_date: day.rate_date,
      metal,
      purity,
      api_price: day[field],
      premium_pct: metal === 'gold' ? premium.gold_pct : premium.silver_pct,
      market_price: market[field],
      usd_inr: day.usd_inr,
      source: day.source,
      benchmark: day.benchmark,
      rate_time: day.rate_time,
      created_at: day.created_at,
    },
  }));
}
