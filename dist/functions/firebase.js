"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureAdminApp = ensureAdminApp;
exports.fromFirestore = fromFirestore;
exports.readPremiumFromRemoteConfig = readPremiumFromRemoteConfig;
exports.firestoreStore = firestoreStore;
exports.publishToRemoteConfig = publishToRemoteConfig;
/** Firestore and Remote Config adapters for the job (firebase-admin). */
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const remote_config_1 = require("firebase-admin/remote-config");
const types_1 = require("../shared/types");
const rates_1 = require("../shared/rates");
function ensureAdminApp() {
    if ((0, app_1.getApps)().length === 0)
        (0, app_1.initializeApp)();
}
const TIME_FIELDS = ['rate_time', 'created_at', 'last_attempt_at'];
/** ISO strings → Firestore Timestamps, so the console shows real times. */
function toFirestore(row) {
    const out = { ...row };
    for (const field of TIME_FIELDS) {
        const value = out[field];
        if (typeof value === 'string')
            out[field] = firestore_1.Timestamp.fromDate(new Date(value));
    }
    return out;
}
/** Firestore Timestamps → ISO strings. */
function fromFirestore(data) {
    if (!data)
        return null;
    const out = { ...data };
    for (const field of TIME_FIELDS) {
        const value = out[field];
        if (value && typeof value.toDate === 'function')
            out[field] = value.toDate().toISOString();
    }
    return out;
}
/**
 * The premium in Remote Config now, for the day's row. A missing or invalid value uses `fallback`
 * (the app's default), so the row matches what phones show.
 */
async function readPremiumFromRemoteConfig(fallback = { gold_pct: 0, silver_pct: 0 }) {
    const template = await (0, remote_config_1.getRemoteConfig)().getTemplate();
    const value = (key) => {
        const param = template.parameters[key];
        const def = param?.defaultValue;
        return def?.value;
    };
    return { gold_pct: (0, rates_1.parsePremiumPct)(value(types_1.PREMIUM_GOLD_KEY), fallback.gold_pct), silver_pct: (0, rates_1.parsePremiumPct)(value(types_1.PREMIUM_SILVER_KEY), fallback.silver_pct) };
}
function firestoreStore(db = (0, firestore_1.getFirestore)()) {
    const rates = db.collection(types_1.RATES_COLLECTION);
    return {
        readConfig: async () => fromFirestore((await db.collection(types_1.CONFIG_COLLECTION).doc(types_1.CONFIG_DOC).get()).data()),
        readLatest: async () => fromFirestore((await rates.doc(types_1.LATEST_DOC).get()).data()),
        // set() without merge: a second run on the same day replaces the row, never adds one.
        saveDaily: async (row) => {
            await rates.doc(row.rate_date).set(toFirestore(row));
        },
        saveLatest: async (latest) => {
            await rates.doc(types_1.LATEST_DOC).set(toFirestore(latest));
        },
    };
}
/**
 * Writes the latest rate as the JSON parameter `goldrates_latest` and publishes the template.
 * With `premiumDefault`, also creates the two premium parameters when they are missing, so the
 * owner finds them in the console. An existing premium value is never changed: the owner owns it.
 */
async function publishToRemoteConfig(latest, premiumDefault) {
    const rc = (0, remote_config_1.getRemoteConfig)();
    const template = await rc.getTemplate();
    template.parameters[types_1.REMOTE_CONFIG_KEY] = {
        defaultValue: { value: JSON.stringify(latest) },
        valueType: 'JSON',
        description: 'Daily gold and silver rates (app-goldrates-api-kit). Written by the 5 AM job; do not edit by hand.',
    };
    if (premiumDefault) {
        const seeds = [
            [types_1.PREMIUM_GOLD_KEY, premiumDefault.gold_pct, 'gold'],
            [types_1.PREMIUM_SILVER_KEY, premiumDefault.silver_pct, 'silver'],
        ];
        for (const [key, pct, metal] of seeds) {
            if (template.parameters[key])
                continue;
            template.parameters[key] = {
                defaultValue: { value: String(pct) },
                valueType: 'NUMBER',
                description: `Market premium for ${metal}, in % added to the IBJA rate for every user (0 = plain IBJA, max 10). Edit and publish; no deployment needed.`,
            };
        }
    }
    await rc.publishTemplate(template);
}
