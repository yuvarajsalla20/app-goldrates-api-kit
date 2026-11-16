/**
 * The job against a real Firestore emulator, through the same firebase-admin
 * adapters the deployed function uses. Metals.dev and Remote Config are faked
 * (Remote Config has no emulator, and test calls would use up the quota).
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { beforeEach, describe, expect, it } from 'vitest';
import { firestoreStore } from '../functions/firebase';
import { runDailyRates, type JobDeps } from '../functions/job';
import { MetalsDevError, parseLatestResponse } from '../functions/metalsDev';
import type { LatestRate } from '../shared/types';
import success from '../tests/fixtures/latest-success.json';

process.env.GCLOUD_PROJECT ??= 'demo-goldrates-job';
initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore();

const published: LatestRate[] = [];
function deps(now: string, fetchRates: JobDeps['fetchRates']): JobDeps {
  return {
    now: () => new Date(now),
    ...firestoreStore(db),
    fetchRates,
    publish: async (latest) => void published.push(latest),
    alert: () => undefined,
    logError: (message) => {
      throw new Error(`unexpected ${message}`);
    },
  };
}

beforeEach(async () => {
  published.length = 0;
  await db.recursiveDelete(db.collection('daily_rates'));
  await db.recursiveDelete(db.collection('config'));
});

describe('job on the Firestore emulator', () => {
  it('writes daily_rates/{date} and latest with real timestamps', async () => {
    // Monday 16 Nov 2026, 5:00 AM IST.
    const result = await runDailyRates(deps('2026-11-15T23:30:00Z', async () => parseLatestResponse(success)));
    expect(result.ok).toBe(true);

    const day = (await db.doc('daily_rates/2026-11-16').get()).data()!;
    expect(day).toMatchObject({ gold_24k: 13581.02, gold_22k: 12449.72, gold_18k: 10185.77, silver_925: 164.65, source: 'METALS.DEV', benchmark: 'IBJA' });
    expect(day.created_at).toBeInstanceOf(Timestamp);
    expect(day.rate_time.toDate().toISOString()).toBe('2026-11-16T02:20:11.000Z');

    const latest = (await db.doc('daily_rates/latest').get()).data()!;
    expect(latest).toMatchObject({ rate_date: '2026-11-16', stale: false, last_error: null });
    expect(published[0].created_at).toBe('2026-11-15T23:30:00.000Z');
  });

  it('a failed next day keeps Monday\'s row as latest, stale', async () => {
    await runDailyRates(deps('2026-11-15T23:30:00Z', async () => parseLatestResponse(success)));
    const result = await runDailyRates(
      deps('2026-11-16T23:30:00Z', async () => {
        throw new MetalsDevError('1203', 'Monthly quota exceeded');
      }),
    );
    expect(result.ok).toBe(false);
    expect((await db.doc('daily_rates/2026-11-17').get()).exists).toBe(false);
    const latest = (await db.doc('daily_rates/latest').get()).data()!;
    expect(latest).toMatchObject({ rate_date: '2026-11-16', stale: true, last_error: '1203: Monthly quota exceeded' });
    expect(latest.last_attempt_at.toDate().toISOString()).toBe('2026-11-16T23:30:00.000Z');
    expect(published.at(-1)).toMatchObject({ rate_date: '2026-11-16', stale: true });
  });

  it('reads the manual override from config/goldrates', async () => {
    await db.doc('config/goldrates').set({ manual_gold_24k: 13600, manual_silver_999: 179, manual_usd_inr: null, manual_benchmark: 'GoodReturns' });
    const result = await runDailyRates(
      deps('2026-11-15T23:30:00Z', async () => {
        throw new Error('the API must not be called');
      }),
    );
    expect(result).toMatchObject({ ok: true, source: 'MANUAL' });
    expect((await db.doc('daily_rates/2026-11-16').get()).data()).toMatchObject({ source: 'MANUAL', benchmark: 'GoodReturns', gold_24k: 13600 });
  });
});
