/** Where a day's rate came from. */
export type RateProvider = 'METALS.DEV' | 'MANUAL';

/** The rate fields every stored row has. All prices are ₹ per gram. */
export interface Rates {
  gold_24k: number;
  gold_22k: number;
  gold_18k: number;
  silver_999: number;
  silver_925: number;
  /** ₹ for 1 US dollar, or null when unknown. */
  usd_inr: number | null;
}

/** One `daily_rates/{YYYY-MM-DD}` document. Times are ISO strings here. */
export interface DailyRate extends Rates {
  /** The IST date of the run that saved it, `YYYY-MM-DD`. Also the document id. */
  rate_date: string;
  source: RateProvider;
  /** `https://api.metals.dev/v1/latest` for API rows, '' for manual ones. */
  source_url: string;
  /** `IBJA`, or where a manual rate was taken from. */
  benchmark: string;
  /** When the provider took the price (ISO), or null for manual rows. */
  rate_time: string | null;
  /** True when the price equals the previous row (for example an IBJA holiday). */
  unchanged: boolean;
  /** When the row was saved (ISO). */
  created_at: string;
  /**
   * Market premium (%) in effect when the job saved this row, from Remote Config.
   * Missing on rows saved before v1.1.0.
   */
  premium_gold_pct?: number;
  premium_silver_pct?: number;
  /** The API price + the premium (₹/g): `gold_24k × (1 + premium_gold_pct / 100)`, and so on. Missing before v1.1.0. */
  market_gold_24k?: number;
  market_gold_22k?: number;
  market_gold_18k?: number;
  market_silver_999?: number;
  market_silver_925?: number;
}

/**
 * `daily_rates/latest`, and the JSON in the Remote Config parameter
 * `goldrates_latest`: the newest row plus the job's health.
 */
export interface LatestRate extends DailyRate {
  /** True when the last run failed and this is an older rate. */
  stale: boolean;
  /** `"1203: quota exceeded"` style text, or null after a good run. */
  last_error: string | null;
  /** When the job last ran (ISO), good or bad. */
  last_attempt_at: string;
}

export type Metal = 'gold' | 'silver';
export type GoldPurity = '24K' | '22K' | '18K';
export type SilverPurity = '999' | '925';
export type Purity = GoldPurity | SilverPurity;

/** Remote Config parameters with the market premium (%), one per metal. Set by the owner, read by the app. */
export const PREMIUM_GOLD_KEY = 'goldrates_premium_gold_pct';
export const PREMIUM_SILVER_KEY = 'goldrates_premium_silver_pct';
/** Name of the Remote Config parameter the job publishes. */
export const REMOTE_CONFIG_KEY = 'goldrates_latest';
/** Firestore collection with one row per weekday plus `latest`. */
export const RATES_COLLECTION = 'daily_rates';
/** Document id of the newest row inside {@link RATES_COLLECTION}. */
export const LATEST_DOC = 'latest';
/** Firestore document with the manual override: `config/goldrates`. */
export const CONFIG_COLLECTION = 'config';
export const CONFIG_DOC = 'goldrates';
