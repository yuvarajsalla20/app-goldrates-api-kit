import type { GoldPurity, Metal, Purity, Rates, SilverPurity } from './types';

/** Purity factors (BIS hallmark grades). 24K and 999 are the base rates. */
export const PURITY_FACTORS = {
  gold: { '24K': 1, '22K': 0.9167, '18K': 0.75 } as Record<GoldPurity, number>,
  silver: { '999': 1, '925': 0.925 } as Record<SilverPurity, number>,
} as const;

/** The sanity limit: a new rate more than 10% away from the last one is refused. */
export const SANITY_LIMIT = 0.1;

/** Rounds to 2 decimals (paise). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Turns the two base rates into every purity the kit stores. */
export function convertPurities(base: { gold_24k: number; silver_999: number; usd_inr: number | null }): Rates {
  return {
    gold_24k: round2(base.gold_24k),
    gold_22k: round2(base.gold_24k * PURITY_FACTORS.gold['22K']),
    gold_18k: round2(base.gold_24k * PURITY_FACTORS.gold['18K']),
    silver_999: round2(base.silver_999),
    silver_925: round2(base.silver_999 * PURITY_FACTORS.silver['925']),
    usd_inr: base.usd_inr == null ? null : round2(base.usd_inr),
  };
}

/** A price is usable when it is a finite number above zero. */
export function isPositive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * Checks a new pair of base rates against the last saved one.
 * Returns null when fine, or the reason it was refused.
 */
export function sanityCheck(
  next: { gold_24k: number; silver_999: number },
  last: { gold_24k: number; silver_999: number } | null,
  limit: number = SANITY_LIMIT,
): string | null {
  if (!isPositive(next.gold_24k)) return 'gold rate is zero or missing';
  if (!isPositive(next.silver_999)) return 'silver rate is zero or missing';
  if (!last) return null;
  const checks: Array<[string, number, number]> = [
    ['gold', next.gold_24k, last.gold_24k],
    ['silver', next.silver_999, last.silver_999],
  ];
  for (const [name, now, before] of checks) {
    if (!isPositive(before)) continue;
    const change = (now - before) / before;
    if (Math.abs(change) > limit + 1e-9) {
      const pct = (change * 100).toFixed(1);
      return `${name} rate moved ${change > 0 ? '+' : ''}${pct}% (more than ${Math.round(limit * 100)}%)`;
    }
  }
  return null;
}

/** The stored rate field for a metal and purity, e.g. gold 22K → `gold_22k`. */
export function rateField(metal: Metal, purity: Purity): keyof Rates {
  if (metal === 'gold') {
    if (purity === '24K') return 'gold_24k';
    if (purity === '22K') return 'gold_22k';
    if (purity === '18K') return 'gold_18k';
  } else {
    if (purity === '999') return 'silver_999';
    if (purity === '925') return 'silver_925';
  }
  throw new Error(`Unknown purity ${purity} for ${metal}`);
}

/** ₹ per gram for one metal and purity. */
export function rateFor(rates: Rates, metal: Metal, purity: Purity): number {
  return rates[rateField(metal, purity)] as number;
}

/**
 * Value of an item: grams × the rate for its purity, rounded to 2 decimals.
 * `premiumPct` adds a market premium on top (default 0: plain IBJA).
 */
export function valueOf(
  rates: Rates,
  item: { metal: Metal; purity: Purity; grams: number },
  options: { premiumPct?: number } = {},
): number {
  if (!(item.grams >= 0)) throw new Error('grams must be zero or more');
  const premium = 1 + (options.premiumPct ?? 0) / 100;
  return round2(item.grams * rateFor(rates, item.metal, item.purity) * premium);
}

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
export const NO_PREMIUM: Premium = { gold_pct: 0, silver_pct: 0 };
/** A premium above this is treated as a typo and ignored. */
export const MAX_PREMIUM_PCT = 10;

/** True when either metal has a premium. */
export const hasPremium = (premium: Premium | null | undefined): premium is Premium =>
  !!premium && (premium.gold_pct !== 0 || premium.silver_pct !== 0);

/**
 * Reads one premium value (a Remote Config string or number). Empty, not a
 * number, below 0 or above {@link MAX_PREMIUM_PCT} → `fallback`.
 */
export function parsePremiumPct(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const pct = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(pct) || pct < 0 || pct > MAX_PREMIUM_PCT) return fallback;
  return pct;
}

/**
 * The same rates with the premium added to every purity, rounded to 2
 * decimals. Every other field (date, source, usd_inr…) is kept as it is.
 */
export function applyPremium<T extends Rates>(rates: T, premium: Premium | null | undefined): T {
  if (!hasPremium(premium)) return rates;
  const gold = 1 + premium.gold_pct / 100;
  const silver = 1 + premium.silver_pct / 100;
  return {
    ...rates,
    gold_24k: round2(rates.gold_24k * gold),
    gold_22k: round2(rates.gold_22k * gold),
    gold_18k: round2(rates.gold_18k * gold),
    silver_999: round2(rates.silver_999 * silver),
    silver_925: round2(rates.silver_925 * silver),
  };
}
