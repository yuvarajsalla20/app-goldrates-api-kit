"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CONFIG_DOC = exports.CONFIG_COLLECTION = exports.LATEST_DOC = exports.RATES_COLLECTION = exports.REMOTE_CONFIG_KEY = void 0;
/** Name of the Remote Config parameter the job publishes. */
exports.REMOTE_CONFIG_KEY = 'goldrates_latest';
/** Firestore collection with one row per weekday plus `latest`. */
exports.RATES_COLLECTION = 'daily_rates';
/** Document id of the newest row inside {@link RATES_COLLECTION}. */
exports.LATEST_DOC = 'latest';
/** Firestore document with the manual override: `config/goldrates`. */
exports.CONFIG_COLLECTION = 'config';
exports.CONFIG_DOC = 'goldrates';
