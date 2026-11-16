"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SANITY_LIMIT = exports.PURITY_FACTORS = void 0;
exports.round2 = round2;
exports.convertPurities = convertPurities;
exports.isPositive = isPositive;
exports.sanityCheck = sanityCheck;
exports.rateField = rateField;
exports.rateFor = rateFor;
exports.valueOf = valueOf;
/** Purity factors (BIS hallmark grades). 24K and 999 are the base rates. */
exports.PURITY_FACTORS = {
    gold: { '24K': 1, '22K': 0.9167, '18K': 0.75 },
    silver: { '999': 1, '925': 0.925 },
};
/** The sanity limit: a new rate more than 10% away from the last one is refused. */
exports.SANITY_LIMIT = 0.1;
/** Rounds to 2 decimals (paise). */
function round2(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
/** Turns the two base rates into every purity the kit stores. */
function convertPurities(base) {
    return {
        gold_24k: round2(base.gold_24k),
        gold_22k: round2(base.gold_24k * exports.PURITY_FACTORS.gold['22K']),
        gold_18k: round2(base.gold_24k * exports.PURITY_FACTORS.gold['18K']),
        silver_999: round2(base.silver_999),
        silver_925: round2(base.silver_999 * exports.PURITY_FACTORS.silver['925']),
        usd_inr: base.usd_inr == null ? null : round2(base.usd_inr),
    };
}
/** A price is usable when it is a finite number above zero. */
function isPositive(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
/**
 * Checks a new pair of base rates against the last saved one.
 * Returns null when fine, or the reason it was refused.
 */
function sanityCheck(next, last, limit = exports.SANITY_LIMIT) {
    if (!isPositive(next.gold_24k))
        return 'gold rate is zero or missing';
    if (!isPositive(next.silver_999))
        return 'silver rate is zero or missing';
    if (!last)
        return null;
    const checks = [
        ['gold', next.gold_24k, last.gold_24k],
        ['silver', next.silver_999, last.silver_999],
    ];
    for (const [name, now, before] of checks) {
        if (!isPositive(before))
            continue;
        const change = (now - before) / before;
        if (Math.abs(change) > limit + 1e-9) {
            const pct = (change * 100).toFixed(1);
            return `${name} rate moved ${change > 0 ? '+' : ''}${pct}% (more than ${Math.round(limit * 100)}%)`;
        }
    }
    return null;
}
/** The stored rate field for a metal and purity, e.g. gold 22K → `gold_22k`. */
function rateField(metal, purity) {
    if (metal === 'gold') {
        if (purity === '24K')
            return 'gold_24k';
        if (purity === '22K')
            return 'gold_22k';
        if (purity === '18K')
            return 'gold_18k';
    }
    else {
        if (purity === '999')
            return 'silver_999';
        if (purity === '925')
            return 'silver_925';
    }
    throw new Error(`Unknown purity ${purity} for ${metal}`);
}
/** ₹ per gram for one metal and purity. */
function rateFor(rates, metal, purity) {
    return rates[rateField(metal, purity)];
}
/**
 * Value of an item: grams × the rate for its purity, rounded to 2 decimals.
 * `premiumPct` adds a market premium on top (default 0: plain IBJA).
 */
function valueOf(rates, item, options = {}) {
    if (!(item.grams >= 0))
        throw new Error('grams must be zero or more');
    const premium = 1 + (options.premiumPct ?? 0) / 100;
    return round2(item.grams * rateFor(rates, item.metal, item.purity) * premium);
}
