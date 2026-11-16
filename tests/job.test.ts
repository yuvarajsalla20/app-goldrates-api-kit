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
      premium_gold_pct: 0,
      premium_silver_pct: 0,
      market_gold_24k: 13581.02,
      market_gold_22k: 12449.72,
      market_gold_18k: 10185.77,
      market_silver_999: 178,
      market_silver_925: 164.65,
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

describe('premium on the day\'s row', () => {
  it('saves the API price, the % and the price with the % added', async () => {
    const { deps, state } = fakeWorld({ latest: previous() });
    deps.readPremium = async () => ({ gold_pct: 1.3, silver_pct: 1.3 });
    await runDailyRates(deps);
    expect(state.daily.get('2026-11-16')).toMatchObject({
      gold_24k: 13581.02,
      silver_999: 178,
      premium_gold_pct: 1.3,
      premium_silver_pct: 1.3,
      market_gold_24k: 13757.57,
      market_gold_22k: 12611.57,
      market_gold_18k: 10318.19,
      market_silver_999: 180.31,
      market_silver_925: 166.79,
    });
    expect(state.latest).toMatchObject({ premium_gold_pct: 1.3, market_gold_24k: 13757.57 });
  });
  it('records 0% when the premium cannot be read, and still saves the day', async () => {
    const { deps, state } = fakeWorld({ latest: previous() });
    deps.readPremium = async () => {
      throw new Error('remote config down');
    };
    const result = await runDailyRates(deps);
    expect(result.ok).toBe(true);
    expect(state.daily.get('2026-11-16')).toMatchObject({ premium_gold_pct: 0, market_gold_24k: 13581.02 });
    expect(state.errors).toEqual(['GOLDRATE_READ_PREMIUM_FAILED']);
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

describe('retries at 6, 7 and 8 AM IST, only after a failure', () => {
  const at = (ist: string) => () => new Date(`${ist}+05:30`);
  const failing = (code: string) => async () => {
    throw new MetalsDevError(code, 'boom');
  };

  it('skips without calling the API when today already has a rate', async () => {
    const { deps, state } = fakeWorld({ latest: previous({ rate_date: '2026-11-16' }) });
    deps.now = at('2026-11-16T06:00:00');
    expect(await runDailyRates(deps)).toEqual({ ok: true, skipped: 'today already has a rate' });
    expect(state.fetchCalls).toBe(0);
  });

  it('after a temporary 5 AM failure: retries quietly, then succeeds and sends the recovery email', async () => {
    const world = fakeWorld({ latest: previous(), fetch: failing('NETWORK') });
    await runDailyRates(world.deps); // 5 AM fails
    expect(world.state.alerts.map((a) => a.kind)).toEqual(['failed']);
    expect(world.state.latest).toMatchObject({ stale: true, last_error_code: 'NETWORK' });

    world.deps.now = at('2026-11-16T06:00:00'); // 6 AM, still down: no new email
    expect(await runDailyRates(world.deps)).toMatchObject({ ok: false });
    expect(world.state.alerts).toHaveLength(1);
    expect(world.state.fetchCalls).toBe(2);

    world.deps.now = at('2026-11-16T07:00:00');
    world.deps.fetchRates = async () => API_RATES; // back up
    expect(await runDailyRates(world.deps)).toMatchObject({ ok: true, recovered: true });
    expect(world.state.daily.has('2026-11-16')).toBe(true);
    expect(world.state.alerts.map((a) => a.kind)).toEqual(['failed', 'recovered']);

    world.deps.now = at('2026-11-16T08:00:00'); // nothing left to do
    expect(await runDailyRates(world.deps)).toMatchObject({ skipped: 'today already has a rate' });
    expect(world.state.daily.size).toBe(1);
  });

  it('emails again if the final 8 AM try fails too', async () => {
    const world = fakeWorld({ latest: previous(), fetch: failing('HTTP_503') });
    for (const t of ['2026-11-16T05:00:00', '2026-11-16T06:00:00', '2026-11-16T07:00:00', '2026-11-16T08:00:00']) {
      world.deps.now = at(t);
      await runDailyRates(world.deps);
    }
    expect(world.state.fetchCalls).toBe(4);
    expect(world.state.alerts.map((a) => a.runAt)).toEqual(['2026-11-15T23:30:00.000Z', '2026-11-16T02:30:00.000Z']);
  });

  it('does not retry a lasting problem (bad key, quota), saving API calls', async () => {
    const world = fakeWorld({ latest: previous(), fetch: failing('1203') });
    await runDailyRates(world.deps);
    world.deps.now = at('2026-11-16T06:00:00');
    expect(await runDailyRates(world.deps)).toMatchObject({ ok: true, skipped: expect.stringMatching(/^not retried: 1203/) });
    expect(world.state.fetchCalls).toBe(1);
  });

  it('but does run when a manual rate was set after the failure', async () => {
    const world = fakeWorld({ latest: previous(), fetch: failing('1203') });
    await runDailyRates(world.deps);
    world.deps.readConfig = async () => ({ manual_gold_24k: 13600, manual_silver_999: 179 });
    world.deps.now = at('2026-11-16T06:00:00');
    expect(await runDailyRates(world.deps)).toMatchObject({ ok: true, source: 'MANUAL' });
    expect(world.state.fetchCalls).toBe(1);
  });

  it('a manual Force run at another hour always runs', async () => {
    const { deps, state } = fakeWorld({ latest: previous({ rate_date: '2026-11-16' }) });
    deps.now = at('2026-11-16T12:30:00');
    expect(await runDailyRates(deps)).toMatchObject({ ok: true, source: 'METALS.DEV' });
    expect(state.fetchCalls).toBe(1);
  });
});
