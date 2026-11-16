/**
 * The daily job's logic, with every outside service passed in, so it can be
 * tested without Firebase. `index.ts` wires it to Firestore, Remote Config,
 * the Metals.dev secret and the scheduler.
 */
import { NO_PREMIUM, applyPremium, convertPurities, isPositive, sanityCheck, type Premium } from '../shared/rates';
import { istDate } from '../shared/schedule';
import type { DailyRate, LatestRate } from '../shared/types';
import { METALS_DEV_LATEST_URL, MetalsDevError, type MetalsDevRates } from './metalsDev';

/** `config/goldrates`. Empty or null fields mean "use the API". */
export interface ManualConfig {
  manual_gold_24k?: number | null;
  manual_silver_999?: number | null;
  manual_usd_inr?: number | null;
  manual_benchmark?: string | null;
}

/** What the job sends when a run fails, or the first good run after a failure. */
export interface RateAlert {
  kind: 'failed' | 'recovered';
  /** IST date of the run. */
  runDate: string;
  /** When the run happened (ISO). */
  runAt: string;
  /** `"1203: Monthly quota exceeded"`, for failures. */
  error: string | null;
  /** What to do, for failures. */
  action: string | null;
  /** The rate the app shows now, or null if there is none yet. */
  showing: LatestRate | null;
}

export interface JobDeps {
  now: () => Date;
  readConfig: () => Promise<ManualConfig | null>;
  readLatest: () => Promise<LatestRate | null>;
  /**
   * The market premium in effect now (Remote Config), saved on the day's row with
   * the resulting market prices. Optional: without it the row records 0%.
   */
  readPremium?: () => Promise<Premium>;
  /** Calls Metals.dev. Throws {@link MetalsDevError} on failure. */
  fetchRates: () => Promise<MetalsDevRates>;
  /** Creates or replaces `daily_rates/{rate_date}`. */
  saveDaily: (row: DailyRate) => Promise<void>;
  /** Creates or replaces `daily_rates/latest`. */
  saveLatest: (latest: LatestRate) => Promise<void>;
  /** Writes `goldrates_latest` to Remote Config. */
  publish: (latest: LatestRate) => Promise<void>;
  /** Failure / recovery notice (log entry, email…). Must not throw; errors are caught anyway. */
  alert: (alert: RateAlert) => Promise<void> | void;
  /** Problems that are not API failures (Firestore or Remote Config down). */
  logError: (message: string, detail?: unknown) => void;
}

export type JobResult =
  | { ok: true; source: DailyRate['source']; row: DailyRate; recovered: boolean }
  | { ok: false; error: string; showing: LatestRate | null };

const isSet = (value: unknown) => value !== null && value !== undefined && value !== '';

/** Manual rates win over the API. Returns null when no manual rate is set. */
function manualRates(config: ManualConfig | null, last: LatestRate | null): MetalsDevRates | null {
  if (!config) return null;
  const gold = config.manual_gold_24k;
  const silver = config.manual_silver_999;
  if (!isSet(gold) && !isSet(silver)) return null;
  if (!isPositive(gold) || !isPositive(silver)) {
    throw new MetalsDevError(
      'MANUAL_INCOMPLETE',
      'Manual rate needs both manual_gold_24k and manual_silver_999 as numbers above zero',
    );
  }
  const usd = isPositive(config.manual_usd_inr) ? config.manual_usd_inr : (last?.usd_inr ?? null);
  return { gold_24k: gold, silver_999: silver, usd_inr: usd, rate_time: null };
}

/** One run of the 5 AM job. Never throws: every problem ends in the result and the logs. */
export async function runDailyRates(deps: JobDeps): Promise<JobResult> {
  const runAt = deps.now();
  const runDate = istDate(runAt);
  let last: LatestRate | null = null;
  try {
    last = await deps.readLatest();
  } catch (error) {
    deps.logError('GOLDRATE_READ_LATEST_FAILED', error);
  }

  try {
    let config: ManualConfig | null = null;
    try {
      config = await deps.readConfig();
    } catch (error) {
      deps.logError('GOLDRATE_READ_CONFIG_FAILED', error);
    }
    const manual = manualRates(config, last);
    const base = manual ?? (await deps.fetchRates());
    const source: DailyRate['source'] = manual ? 'MANUAL' : 'METALS.DEV';

    const problem = sanityCheck(base, last && isPositive(last.gold_24k) ? last : null);
    if (problem) throw new MetalsDevError('SANITY', `Sanity check failed: ${problem}`);

    const rates = convertPurities(base);
    let premium: Premium = NO_PREMIUM;
    if (deps.readPremium) {
      try {
        premium = await deps.readPremium();
      } catch (error) {
        deps.logError('GOLDRATE_READ_PREMIUM_FAILED', error);
      }
    }
    const market = applyPremium(rates, premium);
    const row: DailyRate = {
      rate_date: runDate,
      ...rates,
      source,
      source_url: manual ? '' : METALS_DEV_LATEST_URL,
      benchmark: manual ? String(config?.manual_benchmark ?? '').trim() || 'MANUAL' : 'IBJA',
      rate_time: base.rate_time,
      unchanged: !!last && last.gold_24k === rates.gold_24k && last.silver_999 === rates.silver_999,
      created_at: runAt.toISOString(),
      premium_gold_pct: premium.gold_pct,
      premium_silver_pct: premium.silver_pct,
      market_gold_24k: market.gold_24k,
      market_gold_22k: market.gold_22k,
      market_gold_18k: market.gold_18k,
      market_silver_999: market.silver_999,
      market_silver_925: market.silver_925,
    };
    const latest: LatestRate = { ...row, stale: false, last_error: null, last_attempt_at: runAt.toISOString() };

    await deps.saveDaily(row);
    await deps.saveLatest(latest);
    await safePublish(deps, latest);

    const recovered = !!last?.stale;
    if (recovered) await safeAlert(deps, { kind: 'recovered', runDate, runAt: runAt.toISOString(), error: null, action: null, showing: latest });
    return { ok: true, source, row, recovered };
  } catch (error) {
    const failure =
      error instanceof MetalsDevError ? error : new MetalsDevError('JOB_ERROR', (error as Error)?.message ?? String(error));
    const errorText = failure.summary;
    let showing: LatestRate | null = null;
    if (last && isPositive(last.gold_24k)) {
      // Keep the previous rate with its own date, marked stale.
      showing = { ...last, stale: true, last_error: errorText, last_attempt_at: runAt.toISOString() };
      try {
        await deps.saveLatest(showing);
      } catch (saveError) {
        deps.logError('GOLDRATE_SAVE_LATEST_FAILED', saveError);
      }
      await safePublish(deps, showing);
    }
    await safeAlert(deps, {
      kind: 'failed',
      runDate,
      runAt: runAt.toISOString(),
      error: errorText,
      action: failure.action,
      showing,
    });
    return { ok: false, error: errorText, showing };
  }
}

async function safePublish(deps: JobDeps, latest: LatestRate) {
  try {
    await deps.publish(latest);
  } catch (error) {
    deps.logError('GOLDRATE_REMOTE_CONFIG_FAILED', error);
  }
}

async function safeAlert(deps: JobDeps, alert: RateAlert) {
  try {
    await deps.alert(alert);
  } catch (error) {
    deps.logError('GOLDRATE_ALERT_FAILED', error);
  }
}
