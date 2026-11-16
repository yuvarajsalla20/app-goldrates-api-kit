/** App side of app-goldrates-api-kit (Expo / React Native). */
export { KIT_NAME, KIT_VERSION } from '../shared/kit';
export { PURITY_FACTORS, convertPurities, rateFor, round2, valueOf } from '../shared/rates';
export { OUTDATED_WORKING_DAYS, SCHEDULE, TIME_ZONE, istDate, latestScheduledRunDate, workingDaysBetween } from '../shared/schedule';
export {
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
export { getRatesForDate, type ReadDoc } from './history';
export { rnFirebaseSource, type RateSource, type RnFirebaseRemoteConfigLike } from './source';
export { parseLatest, rateStatus, type RateState, type RateStatus } from './status';
export { useGoldRates } from './useGoldRates';
