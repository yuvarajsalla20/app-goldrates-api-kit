import type { GoldPurity, Metal, Purity, Rates, SilverPurity } from './types';
/** Purity factors (BIS hallmark grades). 24K and 999 are the base rates. */
export declare const PURITY_FACTORS: {
    readonly gold: Record<GoldPurity, number>;
    readonly silver: Record<SilverPurity, number>;
};
/** The sanity limit: a new rate more than 10% away from the last one is refused. */
export declare const SANITY_LIMIT = 0.1;
/** Rounds to 2 decimals (paise). */
export declare function round2(value: number): number;
/** Turns the two base rates into every purity the kit stores. */
export declare function convertPurities(base: {
    gold_24k: number;
    silver_999: number;
    usd_inr: number | null;
}): Rates;
/** A price is usable when it is a finite number above zero. */
export declare function isPositive(value: unknown): value is number;
/**
 * Checks a new pair of base rates against the last saved one.
 * Returns null when fine, or the reason it was refused.
 */
export declare function sanityCheck(next: {
    gold_24k: number;
    silver_999: number;
}, last: {
    gold_24k: number;
    silver_999: number;
} | null, limit?: number): string | null;
/** The stored rate field for a metal and purity, e.g. gold 22K → `gold_22k`. */
export declare function rateField(metal: Metal, purity: Purity): keyof Rates;
/** ₹ per gram for one metal and purity. */
export declare function rateFor(rates: Rates, metal: Metal, purity: Purity): number;
/**
 * Value of an item: grams × the rate for its purity, rounded to 2 decimals.
 * `premiumPct` adds a market premium on top (default 0: plain IBJA).
 */
export declare function valueOf(rates: Rates, item: {
    metal: Metal;
    purity: Purity;
    grams: number;
}, options?: {
    premiumPct?: number;
}): number;
/**
 * Market premium: % added on top of IBJA when values are shown (shops quote a
 * little above the IBJA benchmark). Stored rates always stay plain IBJA.
 */
export interface Premium {
    /** % added to every gold purity, e.g. 1.3. */
    gold_pct: number;
    /** % added to every silver purity. */
    silver_pct: number;
}
/** No premium: plain IBJA. */
export declare const NO_PREMIUM: Premium;
/** A premium above this is treated as a typo and ignored. */
export declare const MAX_PREMIUM_PCT = 10;
/** True when either metal has a premium. */
export declare const hasPremium: (premium: Premium | null | undefined) => premium is Premium;
/**
 * Reads one premium value (a Remote Config string or number). Empty, not a
 * number, below 0 or above {@link MAX_PREMIUM_PCT} → `fallback`.
 */
export declare function parsePremiumPct(value: unknown, fallback?: number): number;
/**
 * The same rates with the premium added to every purity, rounded to 2
 * decimals. Every other field (date, source, usd_inr…) is kept as it is.
 */
export declare function applyPremium<T extends Rates>(rates: T, premium: Premium | null | undefined): T;
