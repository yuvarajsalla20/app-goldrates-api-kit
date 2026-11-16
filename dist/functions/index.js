"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.goldRatesDaily = exports.METALS_DEV_API_KEY = exports.parseLatestResponse = exports.fetchLatestRates = exports.MetalsDevError = exports.METALS_DEV_ERRORS = exports.runDailyRates = exports.alertMessage = exports.toPurityRows = exports.purityRowId = exports.PURITY_ROWS_COLLECTION = exports.KIT_VERSION = exports.KIT_NAME = void 0;
exports.logAlert = logAlert;
exports.createGoldRatesDaily = createGoldRatesDaily;
/**
 * Cloud side of app-goldrates-api-kit.
 *
 * In the app's `functions/src/index.ts`:
 *   export { goldRatesDaily } from 'app-goldrates-api-kit/functions';
 */
const logger = __importStar(require("firebase-functions/logger"));
const params_1 = require("firebase-functions/params");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const schedule_1 = require("../shared/schedule");
const alertMessage_1 = require("./alertMessage");
const firebase_1 = require("./firebase");
const job_1 = require("./job");
const metalsDev_1 = require("./metalsDev");
var kit_1 = require("../shared/kit");
Object.defineProperty(exports, "KIT_NAME", { enumerable: true, get: function () { return kit_1.KIT_NAME; } });
Object.defineProperty(exports, "KIT_VERSION", { enumerable: true, get: function () { return kit_1.KIT_VERSION; } });
var rows_1 = require("../shared/rows");
Object.defineProperty(exports, "PURITY_ROWS_COLLECTION", { enumerable: true, get: function () { return rows_1.PURITY_ROWS_COLLECTION; } });
Object.defineProperty(exports, "purityRowId", { enumerable: true, get: function () { return rows_1.purityRowId; } });
Object.defineProperty(exports, "toPurityRows", { enumerable: true, get: function () { return rows_1.toPurityRows; } });
var alertMessage_2 = require("./alertMessage");
Object.defineProperty(exports, "alertMessage", { enumerable: true, get: function () { return alertMessage_2.alertMessage; } });
var job_2 = require("./job");
Object.defineProperty(exports, "runDailyRates", { enumerable: true, get: function () { return job_2.runDailyRates; } });
var metalsDev_2 = require("./metalsDev");
Object.defineProperty(exports, "METALS_DEV_ERRORS", { enumerable: true, get: function () { return metalsDev_2.METALS_DEV_ERRORS; } });
Object.defineProperty(exports, "MetalsDevError", { enumerable: true, get: function () { return metalsDev_2.MetalsDevError; } });
Object.defineProperty(exports, "fetchLatestRates", { enumerable: true, get: function () { return metalsDev_2.fetchLatestRates; } });
Object.defineProperty(exports, "parseLatestResponse", { enumerable: true, get: function () { return metalsDev_2.parseLatestResponse; } });
/** The secret holding the Metals.dev key. Set it with `firebase functions:secrets:set METALS_DEV_API_KEY`. */
exports.METALS_DEV_API_KEY = (0, params_1.defineSecret)('METALS_DEV_API_KEY');
/** Log entry the failure email (Cloud Monitoring alert) is built on. */
function logAlert(alert, message = (0, alertMessage_1.alertMessage)(alert)) {
    const entry = {
        run_date: alert.runDate,
        error: alert.error,
        action: alert.action,
        showing_rate_date: alert.showing?.rate_date ?? null,
        subject: message.subject,
        text: message.text,
    };
    if (alert.kind === 'failed')
        logger.error('GOLDRATE_API_FAILED', entry);
    else
        logger.warn('GOLDRATE_API_RECOVERED', entry);
}
/** Builds the scheduled function: 5:00 AM IST, Monday to Friday, no retries. */
function createGoldRatesDaily(options = {}) {
    return (0, scheduler_1.onSchedule)({
        schedule: schedule_1.SCHEDULE,
        timeZone: schedule_1.TIME_ZONE,
        region: options.region ?? 'asia-south1',
        retryCount: 0,
        secrets: [exports.METALS_DEV_API_KEY],
        timeoutSeconds: 120,
        memory: '256MiB',
    }, async () => {
        (0, firebase_1.ensureAdminApp)();
        const store = (0, firebase_1.firestoreStore)();
        const result = await (0, job_1.runDailyRates)({
            now: () => new Date(),
            ...store,
            fetchRates: () => (0, metalsDev_1.fetchLatestRates)(exports.METALS_DEV_API_KEY.value()),
            readPremium: () => (0, firebase_1.readPremiumFromRemoteConfig)(options.premiumDefault),
            publish: (latest) => (0, firebase_1.publishToRemoteConfig)(latest, options.premiumDefault),
            alert: async (alert) => {
                const message = (0, alertMessage_1.alertMessage)(alert);
                logAlert(alert, message);
                await options.onAlert?.(alert, message);
            },
            logError: (message, detail) => logger.error(message, { detail: String(detail?.message ?? detail) }),
        });
        if (result.ok && 'skipped' in result) {
            logger.info('GOLDRATE_RETRY_SKIPPED', { reason: result.skipped });
        }
        else if (result.ok) {
            logger.info('GOLDRATE_SAVED', { rate_date: result.row.rate_date, source: result.source, gold_24k: result.row.gold_24k, silver_999: result.row.silver_999 });
        }
    });
}
/** The ready-made job with default options. */
exports.goldRatesDaily = createGoldRatesDaily();
