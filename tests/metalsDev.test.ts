import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { MetalsDevError, fetchLatestRates, parseLatestResponse } from '../functions/metalsDev';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
const reply = (body: unknown, status = 200) => vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));

describe('parseLatestResponse', () => {
  it('keeps only the IBJA prices, the dollar rate and the metal time', () => {
    expect(parseLatestResponse(fixture('latest-success'))).toEqual({
      gold_24k: 13581.02,
      silver_999: 178,
      usd_inr: 94.19,
      rate_time: '2026-11-16T02:20:11.000Z',
    });
  });

  it.each(['1101', '1201', '1202', '1203', '2101', '2102', '2103', '2104'])('maps error %s', (code) => {
    try {
      parseLatestResponse(fixture(`latest-error-${code}`));
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(MetalsDevError);
      expect((error as MetalsDevError).code).toBe(code);
      expect((error as MetalsDevError).action).not.toMatch(/Temporary/);
    }
  });

  it('refuses a response without IBJA gold, or in the wrong unit', () => {
    const body = fixture('latest-success');
    delete body.metals.ibja_gold;
    expect(() => parseLatestResponse(body)).toThrow(/ibja_gold missing/);
    expect(() => parseLatestResponse({ ...fixture('latest-success'), unit: 'toz' })).toThrow(/INR per gram/);
  });
});

describe('fetchLatestRates', () => {
  it('asks for INR per gram and never puts the key in an error', async () => {
    const fetchImpl = reply(fixture('latest-error-1101'), 401);
    const error = await fetchLatestRates('secret-key-123', fetchImpl).catch((e) => e);
    expect(fetchImpl.mock.calls[0][0]).toBe('https://api.metals.dev/v1/latest?api_key=secret-key-123&currency=INR&unit=g');
    expect(error.summary).toBe('1101: API key invalid');
    expect(JSON.stringify({ m: error.message, s: error.summary })).not.toContain('secret-key-123');
  });

  it('turns network errors, timeouts and 5xx into temporary errors', async () => {
    const down = vi.fn(async () => {
      throw new TypeError('fetch failed https://api.metals.dev/v1/latest?api_key=secret-key-123');
    });
    const network = await fetchLatestRates('secret-key-123', down).catch((e) => e);
    expect(network.code).toBe('NETWORK');
    expect(network.message).not.toContain('secret-key-123');

    const slow = vi.fn(async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    });
    expect((await fetchLatestRates('k', slow).catch((e) => e)).code).toBe('TIMEOUT');

    const broken = vi.fn(async () => ({ ok: false, status: 503, json: async () => { throw new Error('not json'); } }));
    const http = await fetchLatestRates('k', broken).catch((e) => e);
    expect(http.code).toBe('HTTP_503');
    expect(http.action).toMatch(/Temporary/);
  });

  it('fails fast without a key', async () => {
    expect((await fetchLatestRates('', reply({})).catch((e) => e)).code).toBe('NO_KEY');
  });
});
