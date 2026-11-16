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
/** One run of the 5 AM job. Never throws: every problem ends in the result and the logs. */
async function runDailyRates(deps) {
    const runAt = deps.now();
    const runDate = (0, schedule_1.istDate)(runAt);
    let last = null;
    try {
        last = await deps.readLatest();
    }
    catch (error) {
        deps.logError('GOLDRATE_READ_LATEST_FAILED', error);
    }
    try {
        let config = null;
        try {
            config = await deps.readConfig();
        }
        catch (error) {
            deps.logError('GOLDRATE_READ_CONFIG_FAILED', error);
        }
        const manual = manualRates(config, last);
        const base = manual ?? (await deps.fetchRates());
        const source = manual ? 'MANUAL' : 'METALS.DEV';
        const problem = (0, rates_1.sanityCheck)(base, last && (0, rates_1.isPositive)(last.gold_24k) ? last : null);
        if (problem)
            throw new metalsDev_1.MetalsDevError('SANITY', `Sanity check failed: ${problem}`);
        const rates = (0, rates_1.convertPurities)(base);
        const row = {
            rate_date: runDate,
            ...rates,
            source,
            source_url: manual ? '' : metalsDev_1.METALS_DEV_LATEST_URL,
            benchmark: manual ? String(config?.manual_benchmark ?? '').trim() || 'MANUAL' : 'IBJA',
            rate_time: base.rate_time,
            unchanged: !!last && last.gold_24k === rates.gold_24k && last.silver_999 === rates.silver_999,
            created_at: runAt.toISOString(),
        };
        const latest = { ...row, stale: false, last_error: null, last_attempt_at: runAt.toISOString() };
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
            showing = { ...last, stale: true, last_error: errorText, last_attempt_at: runAt.toISOString() };
            try {
                await deps.saveLatest(showing);
            }
            catch (saveError) {
                deps.logError('GOLDRATE_SAVE_LATEST_FAILED', saveError);
            }
            await safePublish(deps, showing);
        }
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
