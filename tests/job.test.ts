import { describe, expect, it } from 'vitest';
import { alertMessage } from '../functions/alertMessage';
import { runDailyRates, type JobDeps, type ManualConfig, type RateAlert } from '../functions/job';
import { MetalsDevError, type MetalsDevRates } from '../functions/metalsDev';
import type { DailyRate, LatestRate } from '../shared/types';

// Monday 16 Nov 2026, 5:00 AM IST.
const RUN_AT = new Date('2026-11-15T23:30:00Z');

const API_RATES: MetalsDevRates = { gold_24k: 13581.02, silver_999: 178, usd_inr: 94.19, rate_time: '2026-11-16T02:20:11.000Z' };

const previous = (over: Partial<LatestRate> = {}): LatestRate => ({
  rate_date: '2026-11-13',
  gold_24k: 13500,
  gold_22k: 12375.45,
  gold_18k: 10125,
  silver_999: 176,
  silver_925: 162.8,
  usd_inr: 94,
  source: 'METALS.DEV',
  source_url: 'https://api.metals.dev/v1/latest',
  benchmark: 'IBJA',
  rate_time: '2026-11-13T02:20:00.000Z',
  unchanged: false,
  created_at: '2026-11-12T23:30:00.000Z',
  stale: false,
  last_error: null,
  last_attempt_at: '2026-11-12T23:30:00.000Z',
  ...over,
});

function fakeWorld(opts: { latest?: LatestRate | null; config?: ManualConfig | null; fetch?: () => Promise<MetalsDevRates> } = {}) {
  const daily = new Map<string, DailyRate>();
  const state = {
    latest: opts.latest ?? null,
    daily,
    published: [] as LatestRate[],
    alerts: [] as RateAlert[],
    errors: [] as string[],
    fetchCalls: 0,
  };
  const deps: JobDeps = {
    now: () => RUN_AT,
    readConfig: async () => opts.config ?? null,
    readLatest: async () => state.latest,
    fetchRates: async () => {
      state.fetchCalls += 1;
      return (opts.fetch ?? (async () => API_RATES))();
    },
    saveDaily: async (row) => void daily.set(row.rate_date, row),
    saveLatest: async (latest) => void (state.latest = latest),
    publish: async (latest) => void state.published.push(latest),
    alert: async (alert) => void state.alerts.push(alert),
    logError: (message) => void state.errors.push(message),
  };
  return { deps, state };
}

describe('a good run', () => {
  it('saves the day, updates latest and publishes it', async () => {
    const { deps, state } = fakeWorld({ latest: previous() });
    const result = await runDailyRates(deps);
    expect(result.ok).toBe(true);
    expect(state.fetchCalls).toBe(1);
    expect(state.daily.get('2026-11-16')).toEqual({
      rate_date: '2026-11-16',
      gold_24k: 13581.02,
      gold_22k: 12449.72,
      gold_18k: 10185.77,
      silver_999: 178,
      silver_925: 164.65,
      usd_inr: 94.19,
      source: 'METALS.DEV',
      source_url: 'https://api.metals.dev/v1/latest',
      benchmark: 'IBJA',
      rate_time: '2026-11-16T02:20:11.000Z',
      unchanged: false,
      created_at: RUN_AT.toISOString(),
    });
    expect(state.latest).toMatchObject({ rate_date: '2026-11-16', stale: false, last_error: null });
    expect(state.published).toEqual([state.latest]);
    expect(state.alerts).toEqual([]);
  });

  it('replaces the row on a second run the same day', async () => {
    const { deps, state } = fakeWorld({ latest: previous() });
    await runDailyRates(deps);
    await runDailyRates(deps);
    expect([...state.daily.keys()]).toEqual(['2026-11-16']);
    expect(state.daily.get('2026-11-16')!.unchanged).toBe(true);
  });

  it('flags an unchanged price (IBJA holiday)', async () => {
    const { deps, state } = fakeWorld({ latest: previous({ gold_24k: 13581.02, silver_999: 178 }) });
    await runDailyRates(deps);
    expect(state.daily.get('2026-11-16')!.unchanged).toBe(true);
  });

  it('sends a recovery notice after a stale day', async () => {
    const { deps, state } = fakeWorld({ latest: previous({ stale: true, last_error: '1203: Monthly quota exceeded' }) });
    const result = await runDailyRates(deps);
    expect(result).toMatchObject({ ok: true, recovered: true });
    expect(state.alerts.map((a) => a.kind)).toEqual(['recovered']);
    expect(alertMessage(state.alerts[0]).subject).toBe('✅ Gold rate API working again – 2026-11-16');
  });
});

describe('manual rate', () => {
  it('wins over the API', async () => {
    const { deps, state } = fakeWorld({
      latest: previous(),
      config: { manual_gold_24k: 13600, manual_silver_999: 179, manual_benchmark: 'GoodReturns' },
    });
    const result = await runDailyRates(deps);
    expect(result.ok).toBe(true);
    expect(state.fetchCalls).toBe(0);
    expect(state.daily.get('2026-11-16')).toMatchObject({
      source: 'MANUAL',
      source_url: '',
      benchmark: 'GoodReturns',
      gold_24k: 13600,
      gold_22k: 12467.12,
      usd_inr: 94,
      rate_time: null,
    });
  });

  it('empty or null fields mean "use the API"', async () => {
    const { deps, state } = fakeWorld({ config: { manual_gold_24k: null, manual_silver_999: null, manual_benchmark: '' } });
    await runDailyRates(deps);
    expect(state.fetchCalls).toBe(1);
  });

  it('half a manual rate is a failure, not a guess', async () => {
    const { deps, state } = fakeWorld({ latest: previous(), config: { manual_gold_24k: 13600 } });
    const result = await runDailyRates(deps);
    expect(result).toMatchObject({ ok: false });
    expect(state.fetchCalls).toBe(0);
    expect(state.alerts[0].error).toMatch(/^MANUAL_INCOMPLETE/);
  });
});

describe('a failed run', () => {
  it('keeps the previous rate with its own date, marks it stale, publishes it and alerts', async () => {
    const { deps, state } = fakeWorld({
      latest: previous(),
      fetch: async () => {
        throw new MetalsDevError('1203', 'Monthly quota exceeded');
      },
    });
    const result = await runDailyRates(deps);
    expect(result).toMatchObject({ ok: false, error: '1203: Monthly quota exceeded' });
    expect(state.daily.size).toBe(0);
    expect(state.latest).toMatchObject({
      rate_date: '2026-11-13',
      gold_24k: 13500,
      stale: true,
      last_error: '1203: Monthly quota exceeded',
      last_attempt_at: RUN_AT.toISOString(),
    });
    expect(state.published).toEqual([state.latest]);
    expect(state.alerts).toHaveLength(1);

    const email = alertMessage(state.alerts[0]);
    expect(email.subject).toBe('⚠️ Gold rate API failed – 2026-11-16');
    expect(email.text).toContain('Run: 2026-11-16 05:00 IST');
    expect(email.text).toContain('Error: 1203: Monthly quota exceeded');
    expect(email.text).toContain('upgrade the plan');
    expect(email.text).toContain('₹13,500.00/g');
    expect(email.text).toContain('as of 2026-11-13');
    expect(email.text).toContain('config/goldrates');
  });

  it('treats a jump over 10% as a failure', async () => {
    const { deps, state } = fakeWorld({ latest: previous(), fetch: async () => ({ ...API_RATES, gold_24k: 1358.1 }) });
    const result = await runDailyRates(deps);
    expect(result).toMatchObject({ ok: false });
    expect(state.alerts[0].error).toMatch(/^SANITY: .*gold rate moved/);
    expect(state.latest!.stale).toBe(true);
  });

  it('with no earlier rate, publishes nothing but still alerts', async () => {
    const { deps, state } = fakeWorld({
      fetch: async () => {
        throw new MetalsDevError('NETWORK', 'Network error');
      },
    });
    await runDailyRates(deps);
    expect(state.published).toEqual([]);
    expect(state.latest).toBeNull();
    expect(alertMessage(state.alerts[0]).text).toContain('no rate to show yet');
  });

  it('never throws, even when Firestore, Remote Config and the alert all fail', async () => {
    const { deps, state } = fakeWorld({ latest: previous() });
    deps.saveDaily = async () => {
      throw new Error('firestore down');
    };
    deps.publish = async () => {
      throw new Error('remote config down');
    };
    deps.alert = async () => {
      throw new Error('mail down');
    };
    const result = await runDailyRates(deps);
    expect(result).toMatchObject({ ok: false, error: 'JOB_ERROR: firestore down' });
    expect(state.errors).toEqual(['GOLDRATE_REMOTE_CONFIG_FAILED', 'GOLDRATE_ALERT_FAILED']);
  });
});
