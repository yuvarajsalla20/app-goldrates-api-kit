/**
 * Cloud side of app-goldrates-api-kit.
 *
 * In the app's `functions/src/index.ts`:
 *   export { goldRatesDaily } from 'app-goldrates-api-kit/functions';
 */
import * as logger from 'firebase-functions/logger';
import { defineSecret } from 'firebase-functions/params';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { SCHEDULE, TIME_ZONE } from '../shared/schedule';
import type { Premium } from '../shared/rates';
import { alertMessage } from './alertMessage';
import { ensureAdminApp, firestoreStore, publishToRemoteConfig, readPremiumFromRemoteConfig } from './firebase';
import { runDailyRates, type RateAlert } from './job';
import { fetchLatestRates } from './metalsDev';

export { KIT_NAME, KIT_VERSION } from '../shared/kit';
export { type Premium } from '../shared/rates';
export { PURITY_ROWS_COLLECTION, purityRowId, toPurityRows, type PurityRateRow } from '../shared/rows';
export { alertMessage } from './alertMessage';
export { runDailyRates, type JobDeps, type JobResult, type ManualConfig, type RateAlert } from './job';
export { METALS_DEV_ERRORS, MetalsDevError, fetchLatestRates, parseLatestResponse, type MetalsDevRates } from './metalsDev';

/** The secret holding the Metals.dev key. Set it with `firebase functions:secrets:set METALS_DEV_API_KEY`. */
export const METALS_DEV_API_KEY = defineSecret('METALS_DEV_API_KEY');

export interface GoldRatesOptions {
  /** Cloud Functions region. Default `asia-south1` (Mumbai). */
  region?: string;
  /**
   * Extra step on failure / recovery, for example sending an email through the
   * Trigger Email extension. The log entries `GOLDRATE_API_FAILED` and
   * `GOLDRATE_API_RECOVERED` are always written, whatever this does.
   */
  onAlert?: (alert: RateAlert, message: { subject: string; text: string }) => Promise<void> | void;
  /**
   * Creates the Remote Config parameters `goldrates_premium_gold_pct` and
   * `goldrates_premium_silver_pct` with these values if they don't exist yet,
   * so the owner can edit them in the console. Never overwrites them.
   */
  premiumDefault?: Premium;
}

/** Log entry the failure email (Cloud Monitoring alert) is built on. */
export function logAlert(alert: RateAlert, message = alertMessage(alert)) {
  const entry = {
    run_date: alert.runDate,
    error: alert.error,
    action: alert.action,
    showing_rate_date: alert.showing?.rate_date ?? null,
    subject: message.subject,
    text: message.text,
  };
  if (alert.kind === 'failed') logger.error('GOLDRATE_API_FAILED', entry);
  else logger.warn('GOLDRATE_API_RECOVERED', entry);
}

/** Builds the scheduled function: 5:00 AM IST, Monday to Friday, no retries. */
export function createGoldRatesDaily(options: GoldRatesOptions = {}) {
  return onSchedule(
    {
      schedule: SCHEDULE,
      timeZone: TIME_ZONE,
      region: options.region ?? 'asia-south1',
      retryCount: 0,
      secrets: [METALS_DEV_API_KEY],
      timeoutSeconds: 120,
      memory: '256MiB',
    },
    async () => {
      ensureAdminApp();
      const store = firestoreStore();
      const result = await runDailyRates({
        now: () => new Date(),
        ...store,
        fetchRates: () => fetchLatestRates(METALS_DEV_API_KEY.value()),
        readPremium: () => readPremiumFromRemoteConfig(options.premiumDefault),
        publish: (latest) => publishToRemoteConfig(latest, options.premiumDefault),
        alert: async (alert) => {
          const message = alertMessage(alert);
          logAlert(alert, message);
          await options.onAlert?.(alert, message);
        },
        logError: (message, detail) => logger.error(message, { detail: String((detail as Error)?.message ?? detail) }),
      });
      if (result.ok && 'skipped' in result) {
        logger.info('GOLDRATE_RETRY_SKIPPED', { reason: result.skipped });
      } else if (result.ok) {
        logger.info('GOLDRATE_SAVED', { rate_date: result.row.rate_date, source: result.source, gold_24k: result.row.gold_24k, silver_999: result.row.silver_999 });
      }
    },
  );
}

/** The ready-made job with default options. */
export const goldRatesDaily = createGoldRatesDaily();
