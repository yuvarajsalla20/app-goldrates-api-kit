/** App side of app-goldrates-api-kit (Expo / React Native). */
export { KIT_NAME, KIT_VERSION } from '../shared/kit';
export {
  MAX_PREMIUM_PCT,
  NO_PREMIUM,
  PURITY_FACTORS,
  applyPremium,
  convertPurities,
  hasPremium,
  parsePremiumPct,
  rateFor,
  round2,
  valueOf,
  type Premium,
} from '../shared/rates';
export { OUTDATED_WORKING_DAYS, SCHEDULE, TIME_ZONE, istDate, latestScheduledRunDate, workingDaysBetween } from '../shared/schedule';
export {
  PREMIUM_GOLD_KEY,
  PREMIUM_SILVER_KEY,
  REMOTE_CONFIG_KEY,
  type DailyRate,
  type GoldPurity,
  type LatestRate,
  type Metal,
  type Purity,
  type RateProvider,
  type Rates,
  type SilverPurity,
} from '../shared/types';
export { PURITY_ROWS_COLLECTION, purityRowId, toPurityRows, type PurityRateRow } from '../shared/rows';
export { getRatesForDate, type ReadDoc } from './history';
export { premiumFromValues, rnFirebaseSource, type RateSource, type RnFirebaseRemoteConfigLike, type RnFirebaseSourceOptions } from './source';
export { parseLatest, rateStatus, type RateState, type RateStatus } from './status';
export { useGoldRates } from './useGoldRates';
