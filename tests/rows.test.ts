import { describe, expect, it } from 'vitest';
import { convertPurities, toPurityRows, type DailyRate } from '../app';

const day: DailyRate = {
  rate_date: '2026-11-16',
  ...convertPurities({ gold_24k: 13581.02, silver_999: 178, usd_inr: 94.19 }),
  source: 'METALS.DEV',
  source_url: 'https://api.metals.dev/v1/latest',
  benchmark: 'IBJA',
  rate_time: '2026-11-16T02:20:11.000Z',
  unchanged: false,
  created_at: '2026-11-15T23:30:00.000Z',
  premium_gold_pct: 1.3,
  premium_silver_pct: 1.3,
};

describe('five rows per day', () => {
  it('one row per metal and purity, with API price, % and market price', () => {
    const rows = toPurityRows(day);
    expect(rows.map((r) => r.id)).toEqual(['2026-11-16_gold_24K', '2026-11-16_gold_22K', '2026-11-16_gold_18K', '2026-11-16_silver_999', '2026-11-16_silver_925']);
    expect(rows[1]!.row).toEqual({
      rate_date: '2026-11-16',
      metal: 'gold',
      purity: '22K',
      api_price: 12449.72,
      premium_pct: 1.3,
      market_price: 12611.57,
      usd_inr: 94.19,
      source: 'METALS.DEV',
      benchmark: 'IBJA',
      rate_time: '2026-11-16T02:20:11.000Z',
      created_at: '2026-11-15T23:30:00.000Z',
    });
    expect(rows[4]!.row).toMatchObject({ metal: 'silver', purity: '925', api_price: 164.65, premium_pct: 1.3, market_price: 166.79 });
  });
  it('treats a row without a premium as 0%', () => {
    const { premium_gold_pct: _g, premium_silver_pct: _s, ...plain } = day;
    const row = toPurityRows(plain)[0]!.row;
    expect(row.premium_pct).toBe(0);
    expect(row.market_price).toBe(row.api_price);
  });
});
