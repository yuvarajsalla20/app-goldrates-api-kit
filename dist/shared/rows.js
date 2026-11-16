"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.purityRowId = exports.PURITY_ROWS_COLLECTION = void 0;
exports.toPurityRows = toPurityRows;
const rates_1 = require("./rates");
/** Firestore collection with five rows per day, one per metal and purity. */
exports.PURITY_ROWS_COLLECTION = 'daily_rate_rows';
const PURITIES = [
    ['gold', '24K', 'gold_24k'],
    ['gold', '22K', 'gold_22k'],
    ['gold', '18K', 'gold_18k'],
    ['silver', '999', 'silver_999'],
    ['silver', '925', 'silver_925'],
];
/** Document id of a row: `2026-11-16_gold_22K`. */
const purityRowId = (date, metal, purity) => `${date}_${metal}_${purity}`;
exports.purityRowId = purityRowId;
/** Splits a day's row into its five purity rows. */
function toPurityRows(day) {
    const premium = { gold_pct: day.premium_gold_pct ?? 0, silver_pct: day.premium_silver_pct ?? 0 };
    const market = (0, rates_1.applyPremium)(day, premium);
    return PURITIES.map(([metal, purity, field]) => ({
        id: (0, exports.purityRowId)(day.rate_date, metal, purity),
        row: {
            rate_date: day.rate_date,
            metal,
            purity,
            api_price: day[field],
            premium_pct: metal === 'gold' ? premium.gold_pct : premium.silver_pct,
            market_price: market[field],
            usd_inr: day.usd_inr,
            source: day.source,
            benchmark: day.benchmark,
            rate_time: day.rate_time,
            created_at: day.created_at,
        },
    }));
}
