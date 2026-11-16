/**
 * The daily job's logic, with every outside service passed in, so it can be
 * tested without Firebase. `index.ts` wires it to Firestore, Remote Config,
 * the Metals.dev secret and the scheduler.
 */
import { type Premium } from '../shared/rates';
import type { DailyRate, LatestRate } from '../shared/types';
import { type MetalsDevRates } from './metalsDev';
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
export type JobResult = {
    ok: true;
    source: DailyRate['source'];
    row: DailyRate;
    recovered: boolean;
} | {
    ok: false;
    error: string;
    showing: LatestRate | null;
};
/** One run of the 5 AM job. Never throws: every problem ends in the result and the logs. */
export declare function runDailyRates(deps: JobDeps): Promise<JobResult>;
