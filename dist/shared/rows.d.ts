import type { DailyRate, Metal, Purity, RateProvider } from './types';
/** Firestore collection with five rows per day, one per metal and purity. */
export declare const PURITY_ROWS_COLLECTION = "daily_rate_rows";
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
/** Document id of a row: `2026-11-16_gold_22K`. */
export declare const purityRowId: (date: string, metal: Metal, purity: Purity) => string;
/** Splits a day's row into its five purity rows. */
export declare function toPurityRows(day: DailyRate): Array<{
    id: string;
    row: PurityRateRow;
}>;
