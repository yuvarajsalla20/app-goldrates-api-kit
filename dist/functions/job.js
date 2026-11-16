"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDailyRates = runDailyRates;
/**
 * The daily job's logic, with every outside service passed in, so it can be
 * tested without Firebase. `index.ts` wires it to Firestore, Remote Config,
 * the Metals.dev secret and the scheduler.
 */
const rates_1 = require("../shared/rates");
const schedule_1 = require("../shared/schedule");
const metalsDev_1 = require("./metalsDev");
const isSet = (value) => value !== null && value !== undefined && value !== '';
/** Manual rates win over the API. Returns null when no manual rate is set. */
function manualRates(config, last) {
    if (!config)
        return null;
    const gold = config.manual_gold_24k;
    const silver = config.manual_silver_999;
    if (!isSet(gold) && !isSet(silver))
        return null;
    if (!(0, rates_1.isPositive)(gold) || !(0, rates_1.isPositive)(silver)) {
        throw new metalsDev_1.MetalsDevError('MANUAL_INCOMPLETE', 'Manual rate needs both manual_gold_24k and manual_silver_999 as numbers above zero');
    }
    const usd = (0, rates_1.isPositive)(config.manual_usd_inr) ? config.manual_usd_inr : (last?.usd_inr ?? null);
    return { gold_24k: gold, silver_999: silver, usd_inr: usd, rate_time: null };
}
/**
 * One run of the job. Never throws: every problem ends in the result and the logs.
 *
 * The 5 AM run (and any manual "Force run") always runs. A retry slot (6, 7 and 8 AM IST) runs only when today
 * has no good rate yet and the last failure was temporary, or a manual rate has been set since; otherwise it is
 * skipped without calling the API. Emails: on the 5 AM failure, on the final (8 AM) failure, and when a run
 * succeeds after a failure.
 */
async function runDailyRates(deps) {
    const runAt = deps.now();
    const runDate = (0, schedule_1.istDate)(runAt);
    const kind = (0, schedule_1.runKind)(runAt);
    let last = null;
    try {
        last = await deps.readLatest();
    }
    catch (error) {
        deps.logError('GOLDRATE_READ_LATEST_FAILED', error);
    }
    let config = null;
    try {
        config = await deps.readConfig();
    }
    catch (error) {
        deps.logError('GOLDRATE_READ_CONFIG_FAILED', error);
    }
    if (kind !== 'first') {
        if (last && last.rate_date === runDate && !last.stale)
            return { ok: true, skipped: 'today already has a rate' };
        const manualSet = !!config && (isSet(config.manual_gold_24k) || isSet(config.manual_silver_999));
        if (last && !last.stale)
            return { ok: true, skipped: 'no failed run to retry today' };
        if (last && !manualSet && !(0, metalsDev_1.isTemporary)(last.last_error_code))
            return { ok: true, skipped: `not retried: ${last.last_error}` };
    }
    try {
        const manual = manualRates(config, last);
        const base = manual ?? (await deps.fetchRates());
        const source = manual ? 'MANUAL' : 'METALS.DEV';
        const problem = (0, rates_1.sanityCheck)(base, last && (0, rates_1.isPositive)(last.gold_24k) ? last : null);
        if (problem)
            throw new metalsDev_1.MetalsDevError('SANITY', `Sanity check failed: ${problem}`);
        const rates = (0, rates_1.convertPurities)(base);
        let premium = rates_1.NO_PREMIUM;
        if (deps.readPremium) {
            try {
                premium = await deps.readPremium();
            }
            catch (error) {
                deps.logError('GOLDRATE_READ_PREMIUM_FAILED', error);
            }
        }
        const market = (0, rates_1.applyPremium)(rates, premium);
        const row = {
            rate_date: runDate,
            ...rates,
            source,
            source_url: manual ? '' : metalsDev_1.METALS_DEV_LATEST_URL,
            benchmark: manual ? String(config?.manual_benchmark ?? '').trim() || 'MANUAL' : 'IBJA',
            rate_time: base.rate_time,
            unchanged: !!last && last.gold_24k === rates.gold_24k && last.silver_999 === rates.silver_999,
            created_at: runAt.toISOString(),
            premium_gold_pct: premium.gold_pct,
            premium_silver_pct: premium.silver_pct,
            market_gold_24k: market.gold_24k,
            market_gold_22k: market.gold_22k,
            market_gold_18k: market.gold_18k,
            market_silver_999: market.silver_999,
            market_silver_925: market.silver_925,
        };
        const latest = { ...row, stale: false, last_error: null, last_error_code: null, last_attempt_at: runAt.toISOString() };
        await deps.saveDaily(row);
        await deps.saveLatest(latest);
        await safePublish(deps, latest);
        const recovered = !!last?.stale;
        if (recovered)
            await safeAlert(deps, { kind: 'recovered', runDate, runAt: runAt.toISOString(), error: null, action: null, showing: latest });
        return { ok: true, source, row, recovered };
    }
    catch (error) {
        const failure = error instanceof metalsDev_1.MetalsDevError ? error : new metalsDev_1.MetalsDevError('JOB_ERROR', error?.message ?? String(error));
        const errorText = failure.summary;
        let showing = null;
        if (last && (0, rates_1.isPositive)(last.gold_24k)) {
            // Keep the previous rate with its own date, marked stale.
            showing = { ...last, stale: true, last_error: errorText, last_error_code: failure.code, last_attempt_at: runAt.toISOString() };
            try {
                await deps.saveLatest(showing);
            }
            catch (saveError) {
                deps.logError('GOLDRATE_SAVE_LATEST_FAILED', saveError);
            }
            await safePublish(deps, showing);
        }
        // A retry that fails again stays quiet; the 5 AM failure and the day's final try send the email.
        if (kind !== 'retry')
            await safeAlert(deps, {
                kind: 'failed',
                runDate,
                runAt: runAt.toISOString(),
                error: errorText,
                action: failure.action,
                showing,
            });
        return { ok: false, error: errorText, showing };
    }
}
async function safePublish(deps, latest) {
    try {
        await deps.publish(latest);
    }
    catch (error) {
        deps.logError('GOLDRATE_REMOTE_CONFIG_FAILED', error);
    }
}
async function safeAlert(deps, alert) {
    try {
        await deps.alert(alert);
    }
    catch (error) {
        deps.logError('GOLDRATE_ALERT_FAILED', error);
    }
}
