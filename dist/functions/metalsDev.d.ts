/**
 * Metals.dev client: one call to `/v1/latest?currency=INR&unit=g`.
 * The API key travels in the query string, so the full URL is never logged
 * or put into an error message.
 */
export declare const METALS_DEV_LATEST_URL = "https://api.metals.dev/v1/latest";
/** The four fields the kit keeps from a good response. */
export interface MetalsDevRates {
    gold_24k: number;
    silver_999: number;
    usd_inr: number | null;
    /** `timestamps.metal`, ISO, or null if missing. */
    rate_time: string | null;
}
/** Known Metals.dev error codes with what the owner should do. */
export declare const METALS_DEV_ERRORS: Record<string, {
    meaning: string;
    action: string;
}>;
/** Why a call failed. `code` is the Metals.dev error code, or one of the kit's own. */
export declare class MetalsDevError extends Error {
    readonly code: string;
    constructor(code: string, message: string);
    /** `"1203: Monthly quota exceeded"` style text for logs and the alert. */
    get summary(): string;
    /** What to do about it. */
    get action(): string;
}
type FetchLike = (url: string, init?: {
    signal?: AbortSignal;
}) => Promise<{
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}>;
/** Reads a parsed Metals.dev body. Throws {@link MetalsDevError} on any problem. */
export declare function parseLatestResponse(body: unknown): MetalsDevRates;
/** Makes the one call. Network errors, timeouts and 5xx become `NETWORK` / `HTTP_5xx` errors. */
export declare function fetchLatestRates(apiKey: string, fetchImpl?: FetchLike): Promise<MetalsDevRates>;
export {};
