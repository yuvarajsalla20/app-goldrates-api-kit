import { NO_PREMIUM, applyPremium, isPositive, type Premium } from '../shared/rates';
import { OUTDATED_WORKING_DAYS, latestScheduledRunDate, workingDaysBetween } from '../shared/schedule';
import type { LatestRate } from '../shared/types';

/**
 * - `none`: no rate at all (first install, offline). Show "Rate not available" and hide values.
 * - `current`: from the latest scheduled run.
 * - `behind`: not from the latest scheduled run. Show the rate with a warning.
 * - `outdated`: 3 or more working days behind. Show "Rates may be outdated".
 */
export type RateState = 'none' | 'current' | 'behind' | 'outdated';

export interface RateStatus {
  state: RateState;
  /** The rate to show and value with: IBJA plus the premium. Null when `state` is `none`. */
  rates: LatestRate | null;
  /** The plain IBJA rate, as stored. Equal to `rates` when there is no premium. */
  ibja: LatestRate | null;
  /** The premium included in `rates` (0 / 0 = plain IBJA). */
  premium: Premium;
  /** `YYYY-MM-DD` of the rate shown, for "as of 14 Nov". */
  rateDate: string | null;
  /** True for `behind` and `outdated`: show a warning next to the rate. */
  stale: boolean;
  /** Working days the rate is behind the latest scheduled run. */
  daysBehind: number;
}

const NUMBER_FIELDS = ['gold_24k', 'gold_22k', 'gold_18k', 'silver_999', 'silver_925'] as const;

/** Reads the Remote Config JSON. Returns null for anything empty or malformed. */
export function parseLatest(json: string | null | undefined): LatestRate | null {
  if (!json) return null;
  try {
    const data = JSON.parse(json);
    if (!data || typeof data !== 'object') return null;
    if (typeof data.rate_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(data.rate_date)) return null;
    for (const field of NUMBER_FIELDS) if (!isPositive(data[field])) return null;
    return data as LatestRate;
  } catch {
    return null;
  }
}

/** Decides what the app shows for a rate at a given moment, with the market premium added. */
export function rateStatus(latest: LatestRate | null, now: Date = new Date(), premium: Premium = NO_PREMIUM): RateStatus {
  if (!latest) return { state: 'none', rates: null, ibja: null, premium, rateDate: null, stale: false, daysBehind: 0 };
  const expected = latestScheduledRunDate(now);
  const daysBehind = workingDaysBetween(latest.rate_date, expected);
  const behind = daysBehind > 0 || latest.stale === true;
  const state: RateState = daysBehind >= OUTDATED_WORKING_DAYS ? 'outdated' : behind ? 'behind' : 'current';
  return { state, rates: applyPremium(latest, premium), ibja: latest, premium, rateDate: latest.rate_date, stale: state !== 'current', daysBehind };
}
