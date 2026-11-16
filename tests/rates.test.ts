import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KIT_NAME, KIT_VERSION, convertPurities, rateFor, valueOf } from '../app';
import { sanityCheck } from '../shared/rates';

describe('kit info', () => {
  it('matches package.json', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    expect(KIT_NAME).toBe(pkg.name);
    expect(KIT_VERSION).toBe(pkg.version);
  });
});

describe('purity conversion', () => {
  it('matches the 14 Nov 2026 example in the README', () => {
    expect(convertPurities({ gold_24k: 13581.02, silver_999: 178, usd_inr: 94.19 })).toEqual({
      gold_24k: 13581.02,
      gold_22k: 12449.72,
      gold_18k: 10185.77,
      silver_999: 178,
      silver_925: 164.65,
      usd_inr: 94.19,
    });
  });

  it('keeps a missing dollar rate as null', () => {
    expect(convertPurities({ gold_24k: 100, silver_999: 1, usd_inr: null }).usd_inr).toBeNull();
  });
});

describe('sanity check', () => {
  const last = { gold_24k: 13581.02, silver_999: 178 };
  it('passes normal moves and the first run', () => {
    expect(sanityCheck({ gold_24k: 13700, silver_999: 180 }, last)).toBeNull();
    expect(sanityCheck({ gold_24k: 13700, silver_999: 180 }, null)).toBeNull();
    expect(sanityCheck({ gold_24k: 13581.02 * 1.1, silver_999: 178 }, last)).toBeNull();
  });
  it('refuses zero and jumps over 10%', () => {
    expect(sanityCheck({ gold_24k: 0, silver_999: 178 }, last)).toMatch(/gold rate is zero/);
    expect(sanityCheck({ gold_24k: 13581, silver_999: 0 }, null)).toMatch(/silver rate is zero/);
    expect(sanityCheck({ gold_24k: 1358.1, silver_999: 178 }, last)).toMatch(/gold rate moved -90\.0%/);
    expect(sanityCheck({ gold_24k: 13581, silver_999: 200 }, last)).toMatch(/silver rate moved \+12\.4%/);
  });
});

describe('valueOf', () => {
  const rates = convertPurities({ gold_24k: 13581.02, silver_999: 178, usd_inr: 94.19 });
  it('is grams × the rate for the purity', () => {
    expect(valueOf(rates, { metal: 'gold', purity: '22K', grams: 10 })).toBe(124497.2);
    expect(valueOf(rates, { metal: 'silver', purity: '925', grams: 100 })).toBe(16465);
    expect(rateFor(rates, 'gold', '18K')).toBe(10185.77);
  });
  it('adds an optional premium', () => {
    expect(valueOf(rates, { metal: 'gold', purity: '24K', grams: 1 }, { premiumPct: 1.3 })).toBe(13757.57);
  });
  it('refuses a bad purity or weight', () => {
    expect(() => valueOf(rates, { metal: 'gold', purity: '925', grams: 1 })).toThrow(/Unknown purity/);
    expect(() => valueOf(rates, { metal: 'gold', purity: '22K', grams: -1 })).toThrow(/grams/);
  });
});
