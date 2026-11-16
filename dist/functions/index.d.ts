import type { Premium } from '../shared/rates';
import { type RateAlert } from './job';
export { KIT_NAME, KIT_VERSION } from '../shared/kit';
export { type Premium } from '../shared/rates';
export { alertMessage } from './alertMessage';
export { runDailyRates, type JobDeps, type JobResult, type ManualConfig, type RateAlert } from './job';
export { METALS_DEV_ERRORS, MetalsDevError, fetchLatestRates, parseLatestResponse, type MetalsDevRates } from './metalsDev';
/** The secret holding the Metals.dev key. Set it with `firebase functions:secrets:set METALS_DEV_API_KEY`. */
export declare const METALS_DEV_API_KEY: import("firebase-functions/params").SecretParam;
export interface GoldRatesOptions {
    /** Cloud Functions region. Default `asia-south1` (Mumbai). */
    region?: string;
    /**
     * Extra step on failure / recovery, for example sending an email through the
     * Trigger Email extension. The log entries `GOLDRATE_API_FAILED` and
     * `GOLDRATE_API_RECOVERED` are always written, whatever this does.
     */
    onAlert?: (alert: RateAlert, message: {
        subject: string;
        text: string;
    }) => Promise<void> | void;
    /**
     * Creates the Remote Config parameters `goldrates_premium_gold_pct` and
     * `goldrates_premium_silver_pct` with these values if they don't exist yet,
     * so the owner can edit them in the console. Never overwrites them.
     */
    premiumDefault?: Premium;
}
/** Log entry the failure email (Cloud Monitoring alert) is built on. */
export declare function logAlert(alert: RateAlert, message?: {
    subject: string;
    text: string;
}): void;
/** Builds the scheduled function: 5:00 AM IST, Monday to Friday, no retries. */
export declare function createGoldRatesDaily(options?: GoldRatesOptions): import("firebase-functions/v2/scheduler").ScheduleFunction;
/** The ready-made job with default options. */
export declare const goldRatesDaily: import("firebase-functions/v2/scheduler").ScheduleFunction;
