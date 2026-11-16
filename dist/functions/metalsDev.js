"use strict";
/**
 * Metals.dev client: one call to `/v1/latest?currency=INR&unit=g`.
 * The API key travels in the query string, so the full URL is never logged
 * or put into an error message.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetalsDevError = exports.METALS_DEV_ERRORS = exports.METALS_DEV_LATEST_URL = void 0;
exports.parseLatestResponse = parseLatestResponse;
exports.fetchLatestRates = fetchLatestRates;
exports.METALS_DEV_LATEST_URL = 'https://api.metals.dev/v1/latest';
const TIMEOUT_MS = 15_000;
/** Known Metals.dev error codes with what the owner should do. */
exports.METALS_DEV_ERRORS = {
    '1101': { meaning: 'API key invalid', action: 'Check METALS_DEV_API_KEY in Firebase secrets.' },
    '1201': { meaning: 'Plan not active (failed payment)', action: 'Check billing on metals.dev.' },
    '1202': { meaning: 'Account not active or disabled', action: 'Check the account on metals.dev.' },
    '1203': {
        meaning: 'Monthly quota exceeded',
        action: 'Wait for next month or upgrade the plan. Set a manual rate meanwhile.',
    },
    '2101': { meaning: 'Unsupported metal, authority or unit code', action: 'Kit bug: report it.' },
    '2102': { meaning: 'Mandatory parameter missing', action: 'Kit bug: report it.' },
    '2103': { meaning: 'Unsupported currency', action: 'Kit bug: report it.' },
    '2104': { meaning: 'Invalid date format', action: 'Kit bug: report it.' },
    '2105': { meaning: 'Date range invalid or too long', action: 'Kit bug: report it.' },
    // The kit's own codes.
    NO_KEY: { meaning: 'METALS_DEV_API_KEY is not set', action: 'Run: firebase functions:secrets:set METALS_DEV_API_KEY, then deploy again.' },
    SANITY: {
        meaning: 'Sanity check failed',
        action: 'Compare with ibja.co. If the new rate is right, set it as a manual rate in config/goldrates and re-run the job.',
    },
    MANUAL_INCOMPLETE: {
        meaning: 'Manual rate incomplete',
        action: 'In config/goldrates set both manual_gold_24k and manual_silver_999, or clear both to use the API.',
    },
};
/** Why a call failed. `code` is the Metals.dev error code, or one of the kit's own. */
class MetalsDevError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'MetalsDevError';
    }
    /** `"1203: Monthly quota exceeded"` style text for logs and the alert. */
    get summary() {
        return `${this.code}: ${this.message}`;
    }
    /** What to do about it. */
    get action() {
        return exports.METALS_DEV_ERRORS[this.code]?.action ?? 'Temporary problem. The next run tries again.';
    }
}
exports.MetalsDevError = MetalsDevError;
const num = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
/** Reads a parsed Metals.dev body. Throws {@link MetalsDevError} on any problem. */
function parseLatestResponse(body) {
    if (!body || typeof body !== 'object')
        throw new MetalsDevError('BAD_RESPONSE', 'Response is not JSON');
    const data = body;
    if (data.status !== 'success') {
        const code = data.error_code != null ? String(data.error_code) : 'UNKNOWN';
        const known = exports.METALS_DEV_ERRORS[code]?.meaning;
        throw new MetalsDevError(code, known ?? String(data.error_message ?? 'Request failed'));
    }
    if (data.currency !== 'INR' || data.unit !== 'g') {
        throw new MetalsDevError('BAD_RESPONSE', `Expected INR per gram, got ${data.currency} per ${data.unit}`);
    }
    const gold = num(data.metals?.ibja_gold);
    const silver = num(data.metals?.ibja_silver);
    if (gold == null)
        throw new MetalsDevError('BAD_RESPONSE', 'metals.ibja_gold missing');
    if (silver == null)
        throw new MetalsDevError('BAD_RESPONSE', 'metals.ibja_silver missing');
    const rateTime = typeof data.timestamps?.metal === 'string' ? data.timestamps.metal : null;
    return { gold_24k: gold, silver_999: silver, usd_inr: num(data.currencies?.USD), rate_time: rateTime };
}
/** Makes the one call. Network errors, timeouts and 5xx become `NETWORK` / `HTTP_5xx` errors. */
async function fetchLatestRates(apiKey, fetchImpl = fetch) {
    if (!apiKey)
        throw new MetalsDevError('NO_KEY', 'METALS_DEV_API_KEY is not set');
    const url = `${exports.METALS_DEV_LATEST_URL}?api_key=${encodeURIComponent(apiKey)}&currency=INR&unit=g`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let body;
    let status = 0;
    try {
        const response = await fetchImpl(url, { signal: controller.signal });
        status = response.status;
        try {
            body = await response.json();
        }
        catch {
            body = undefined;
        }
    }
    catch (error) {
        const timedOut = error?.name === 'AbortError';
        throw new MetalsDevError(timedOut ? 'TIMEOUT' : 'NETWORK', timedOut ? 'No answer within 15 seconds' : 'Network error');
    }
    finally {
        clearTimeout(timer);
    }
    // Metals.dev puts its own error codes in the body even on 4xx, so read those first.
    if (body && typeof body === 'object' && body.status === 'failure') {
        return parseLatestResponse(body);
    }
    if (status >= 400)
        throw new MetalsDevError(`HTTP_${status}`, `HTTP ${status}`);
    return parseLatestResponse(body);
}
