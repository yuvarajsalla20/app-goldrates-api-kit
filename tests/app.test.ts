import { describe, expect, it, vi } from 'vitest';
import { getRatesForDate, latestScheduledRunDate, parseLatest, rateStatus, rnFirebaseSource, workingDaysBetween } from '../app';
import type { LatestRate } from '../shared/types';

/** A moment given in IST. */
const ist = (local: string) => new Date(`${local}+05:30`);

const latest = (rate_date: string, stale = false): LatestRate => ({
  rate_date,
  gold_24k: 13581.02,
  gold_22k: 12449.72,
  gold_18k: 10185.77,
  silver_999: 178,
  silver_925: 164.65,
  usd_inr: 94.19,
  source: 'METALS.DEV',
  source_url: 'https://api.metals.dev/v1/latest',
  benchmark: 'IBJA',
  rate_time: null,
  unchanged: false,
  created_at: '2026-11-16T00:00:00.000Z',
  stale,
  last_error: stale ? 'NETWORK: Network error' : null,
  last_attempt_at: '2026-11-16T00:00:00.000Z',
});

describe('latest scheduled run', () => {
  it('is today after 5 AM IST on a weekday', () => {
    expect(latestScheduledRunDate(ist('2026-11-16T05:00:00'))).toBe('2026-11-16'); // Monday
    expect(latestScheduledRunDate(ist('2026-11-20T23:59:00'))).toBe('2026-11-20'); // Friday night
  });
  it('is the previous weekday before 5 AM and on weekends', () => {
    expect(latestScheduledRunDate(ist('2026-11-17T04:59:00'))).toBe('2026-11-16'); // Tuesday early
    expect(latestScheduledRunDate(ist('2026-11-16T04:00:00'))).toBe('2026-11-13'); // Monday early → Friday
    expect(latestScheduledRunDate(ist('2026-11-21T12:00:00'))).toBe('2026-11-20'); // Saturday
    expect(latestScheduledRunDate(ist('2026-11-22T12:00:00'))).toBe('2026-11-20'); // Sunday
  });
  it('uses the IST date even when UTC is still the day before', () => {
    expect(latestScheduledRunDate(new Date('2026-11-16T00:15:00Z'))).toBe('2026-11-16'); // 05:45 IST
  });
  it('counts working days only', () => {
    expect(workingDaysBetween('2026-11-13', '2026-11-16')).toBe(1); // Fri → Mon
    expect(workingDaysBetween('2026-11-16', '2026-11-16')).toBe(0);
    expect(workingDaysBetween('2026-11-13', '2026-11-19')).toBe(4);
  });
});

describe('rateStatus', () => {
  it('no rate → none', () => {
    expect(rateStatus(null, ist('2026-11-16T10:00:00'))).toMatchObject({ state: 'none', rates: null, stale: false });
  });
  it('today\'s rate → current, no warning', () => {
    expect(rateStatus(latest('2026-11-16'), ist('2026-11-16T10:00:00'))).toMatchObject({ state: 'current', stale: false, rateDate: '2026-11-16' });
  });
  it('Friday\'s rate on the weekend → current', () => {
    expect(rateStatus(latest('2026-11-20'), ist('2026-11-22T10:00:00')).state).toBe('current');
  });
  it('one working day behind → warning', () => {
    expect(rateStatus(latest('2026-11-13'), ist('2026-11-16T10:00:00'))).toMatchObject({ state: 'behind', stale: true, daysBehind: 1 });
  });
  it('a stale flag from the job → warning even with today\'s date', () => {
    expect(rateStatus(latest('2026-11-16', true), ist('2026-11-16T10:00:00')).state).toBe('behind');
  });
  it('3 working days behind → outdated', () => {
    expect(rateStatus(latest('2026-11-13'), ist('2026-11-18T10:00:00'))).toMatchObject({ state: 'outdated', daysBehind: 3 });
  });
});

describe('parseLatest', () => {
  it('reads the Remote Config JSON', () => {
    expect(parseLatest(JSON.stringify(latest('2026-11-16')))?.gold_22k).toBe(12449.72);
  });
  it('returns null for empty or broken values, never throws', () => {
    expect(parseLatest('')).toBeNull();
    expect(parseLatest(null)).toBeNull();
    expect(parseLatest('{not json')).toBeNull();
    expect(parseLatest(JSON.stringify({ ...latest('2026-11-16'), gold_22k: 0 }))).toBeNull();
    expect(parseLatest(JSON.stringify({ ...latest('2026-11-16'), rate_date: 'yesterday' }))).toBeNull();
  });
});

describe('rnFirebaseSource', () => {
  it('reads the parameter and activates real-time updates before telling the app', async () => {
    let listener: ((event?: unknown, error?: unknown) => void) | undefined;
    const unsubscribe = vi.fn();
    const rc = {
      getValue: vi.fn(() => ({ asString: () => '{"a":1}' })),
      activate: vi.fn(async () => true),
      onConfigUpdated: vi.fn((l: typeof listener) => {
        listener = l;
        return unsubscribe;
      }),
    };
    const source = rnFirebaseSource(rc);
    expect(source.read()).toBe('{"a":1}');
    expect(rc.getValue).toHaveBeenCalledWith('goldrates_latest');
    const onChange = vi.fn();
    const stop = source.subscribe!(onChange);
    listener!({ updatedKeys: ['goldrates_latest'] });
    await vi.waitFor(() => expect(onChange).toHaveBeenCalled());
    expect(rc.activate).toHaveBeenCalled();
    stop();
    expect(unsubscribe).toHaveBeenCalled();
  });
});

describe('getRatesForDate', () => {
  it('reads daily_rates/{date} and turns timestamps into ISO strings', async () => {
    const readDoc = vi.fn(async () => ({ ...latest('2026-11-13'), created_at: { toDate: () => new Date('2026-11-12T23:30:00Z') } }));
    const row = await getRatesForDate(readDoc, '2026-11-13');
    expect(readDoc).toHaveBeenCalledWith('daily_rates', '2026-11-13');
    expect(row?.created_at).toBe('2026-11-12T23:30:00.000Z');
  });
  it('returns null for a day without a row and refuses bad dates', async () => {
    expect(await getRatesForDate(async () => null, '2026-11-14')).toBeNull();
    await expect(getRatesForDate(async () => null, '14 Nov')).rejects.toThrow(/YYYY-MM-DD/);
  });
});

describe('sameStatus', () => {
  it('keeps the old status when only the clock moved within the same state', async () => {
    const { sameStatus } = await import('../app');
    const l = latest('2026-11-16');
    const a = rateStatus(l, ist('2026-11-16T10:00:00'));
    const b = rateStatus(l, ist('2026-11-16T10:01:00'));
    expect(a).not.toBe(b);
    expect(sameStatus(a, b)).toBe(true);
  });
  it('sees a change of state, rate or premium', async () => {
    const { sameStatus } = await import('../app');
    const l = latest('2026-11-13');
    const a = rateStatus(l, ist('2026-11-13T10:00:00'));
    expect(sameStatus(a, rateStatus(l, ist('2026-11-18T10:00:00')))).toBe(false);
    expect(sameStatus(a, rateStatus(latest('2026-11-13'), ist('2026-11-13T10:00:00')))).toBe(false);
    expect(sameStatus(a, rateStatus(l, ist('2026-11-13T10:00:00'), { gold_pct: 1.3, silver_pct: 1.3 }))).toBe(false);
  });
});
