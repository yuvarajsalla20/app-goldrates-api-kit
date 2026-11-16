import { describe, expect, it, vi } from 'vitest';
import {
  MAX_PREMIUM_PCT,
  NO_PREMIUM,
  applyPremium,
  convertPurities,
  parsePremiumPct,
  premiumFromValues,
  rateStatus,
  rnFirebaseSource,
  valueOf,
  type LatestRate,
} from '../app';

const ibja: LatestRate = {
  rate_date: '2026-11-16',
  ...convertPurities({ gold_24k: 13581.02, silver_999: 178, usd_inr: 94.19 }),
  source: 'METALS.DEV',
  source_url: 'https://api.metals.dev/v1/latest',
  benchmark: 'IBJA',
  rate_time: null,
  unchanged: false,
  created_at: '2026-11-16T00:00:00.000Z',
  stale: false,
  last_error: null,
  last_attempt_at: '2026-11-16T00:00:00.000Z',
};
const premium = { gold_pct: 1.3, silver_pct: 1.3 };

describe('applyPremium', () => {
  it('adds the % to every purity and keeps the rest', () => {
    const shown = applyPremium(ibja, premium);
    expect(shown).toMatchObject({
      gold_24k: 13757.57,
      gold_22k: 12611.57,
      gold_18k: 10318.19,
      silver_999: 180.31,
      silver_925: 166.79,
      usd_inr: 94.19,
      rate_date: '2026-11-16',
      benchmark: 'IBJA',
    });
  });
  it('uses each metal\'s own %', () => {
    const shown = applyPremium(ibja, { gold_pct: 2, silver_pct: 0 });
    expect(shown.gold_24k).toBe(13852.64);
    expect(shown.silver_999).toBe(178);
  });
  it('returns the same rates for no premium', () => {
    expect(applyPremium(ibja, NO_PREMIUM)).toBe(ibja);
    expect(applyPremium(ibja, null)).toBe(ibja);
  });
  it('flows into valueOf', () => {
    expect(valueOf(applyPremium(ibja, premium), { metal: 'gold', purity: '22K', grams: 10 })).toBe(126115.7);
  });
});

describe('reading the two Remote Config values', () => {
  it('reads numbers from strings', () => {
    expect(parsePremiumPct('1.3')).toBe(1.3);
    expect(parsePremiumPct(' 0 ')).toBe(0);
    expect(parsePremiumPct(2.5)).toBe(2.5);
  });
  it('falls back on empty, not a number, negative or above the cap', () => {
    expect(parsePremiumPct('', 1.3)).toBe(1.3);
    expect(parsePremiumPct(undefined, 1.3)).toBe(1.3);
    expect(parsePremiumPct('abc', 1.3)).toBe(1.3);
    expect(parsePremiumPct('-1', 1.3)).toBe(1.3);
    expect(parsePremiumPct(String(MAX_PREMIUM_PCT + 0.1), 1.3)).toBe(1.3);
    expect(parsePremiumPct(String(MAX_PREMIUM_PCT))).toBe(MAX_PREMIUM_PCT);
  });
  it('reads goldrates_premium_gold_pct and goldrates_premium_silver_pct', () => {
    const values: Record<string, string> = { goldrates_premium_gold_pct: '1.5', goldrates_premium_silver_pct: '' };
    expect(premiumFromValues((k) => values[k], { gold_pct: 1.3, silver_pct: 1.3 })).toEqual({ gold_pct: 1.5, silver_pct: 1.3 });
  });
});

describe('rateStatus with a premium', () => {
  it('gives the premium rate to show and keeps plain IBJA beside it', () => {
    const status = rateStatus(ibja, new Date('2026-11-16T10:00:00+05:30'), premium);
    expect(status.rates!.gold_24k).toBe(13757.57);
    expect(status.ibja!.gold_24k).toBe(13581.02);
    expect(status.premium).toEqual(premium);
    expect(status.state).toBe('current');
  });
  it('without a premium, rates and ibja are the same (v1.0 behaviour)', () => {
    const status = rateStatus(ibja, new Date('2026-11-16T10:00:00+05:30'));
    expect(status.rates).toBe(status.ibja);
    expect(status.premium).toEqual(NO_PREMIUM);
  });
});

describe('rnFirebaseSource premium', () => {
  it('reads the two parameters, with the app\'s fallback when missing', () => {
    const values: Record<string, string> = { goldrates_premium_gold_pct: '1.3' };
    const rc = { getValue: vi.fn((k: string) => ({ asString: () => values[k] ?? '' })), activate: vi.fn(async () => true) };
    expect(rnFirebaseSource(rc).readPremium!()).toEqual({ gold_pct: 1.3, silver_pct: 0 });
    expect(rnFirebaseSource(rc, { premiumFallback: { gold_pct: 1, silver_pct: 1.3 } }).readPremium!()).toEqual({ gold_pct: 1.3, silver_pct: 1.3 });
  });
  it('still takes a key string, as in v1.0', () => {
    const rc = { getValue: vi.fn(() => ({ asString: () => 'x' })), activate: vi.fn(async () => true) };
    rnFirebaseSource(rc, 'other_key').read();
    expect(rc.getValue).toHaveBeenCalledWith('other_key');
  });
});
