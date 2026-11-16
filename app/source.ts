import { NO_PREMIUM, parsePremiumPct, type Premium } from '../shared/rates';
import { PREMIUM_GOLD_KEY, PREMIUM_SILVER_KEY, REMOTE_CONFIG_KEY } from '../shared/types';

/**
 * Where the app reads today's rate. The kit does not pick a Firebase SDK: the
 * app passes small functions around the Remote Config it already uses.
 */
export interface RateSource {
  /** The current `goldrates_latest` string (cached on the phone), or null. */
  read: () => string | null;
  /**
   * The market premium to add when values are shown, usually from the Remote
   * Config parameters `goldrates_premium_gold_pct` and
   * `goldrates_premium_silver_pct` (see {@link premiumFromValues}). Optional:
   * without it the app shows plain IBJA.
   */
  readPremium?: () => Premium;
  /**
   * Calls `onChange` when a new value is active (Remote Config real-time
   * updates). Returns a function that stops listening. Optional.
   */
  subscribe?: (onChange: () => void) => () => void;
}

/**
 * The premium from Remote Config values (strings). A missing or invalid value
 * (not a number, below 0, above 10) uses `fallback` for that metal.
 */
export function premiumFromValues(
  get: (key: string) => string | null | undefined,
  fallback: Premium = NO_PREMIUM,
): Premium {
  return {
    gold_pct: parsePremiumPct(get(PREMIUM_GOLD_KEY), fallback.gold_pct),
    silver_pct: parsePremiumPct(get(PREMIUM_SILVER_KEY), fallback.silver_pct),
  };
}

/** The parts of `@react-native-firebase/remote-config` the kit uses. */
export interface RnFirebaseRemoteConfigLike {
  getValue(key: string): { asString(): string };
  activate(): Promise<boolean>;
  onConfigUpdated?(listener: (event?: unknown, error?: unknown) => void): () => void;
}

export interface RnFirebaseSourceOptions {
  /** Parameter with the rates JSON. Default `goldrates_latest`. */
  key?: string;
  /** Premium used when the Remote Config parameters are missing. Default 0 / 0 (plain IBJA). */
  premiumFallback?: Premium;
}

/**
 * Ready-made source for `@react-native-firebase/remote-config`
 * (needs an Expo development build).
 *
 *   import remoteConfig from '@react-native-firebase/remote-config';
 *   const source = rnFirebaseSource(remoteConfig());
 */
export function rnFirebaseSource(rc: RnFirebaseRemoteConfigLike, options: string | RnFirebaseSourceOptions = {}): RateSource {
  const { key = REMOTE_CONFIG_KEY, premiumFallback = NO_PREMIUM } = typeof options === 'string' ? { key: options } : options;
  return {
    read: () => rc.getValue(key).asString() || null,
    readPremium: () => premiumFromValues((k) => rc.getValue(k).asString(), premiumFallback),
    subscribe: rc.onConfigUpdated
      ? (onChange) =>
          rc.onConfigUpdated!((_event, error) => {
            if (error) return;
            // A real-time update must be activated before getValue sees it.
            rc.activate().then(onChange, () => undefined);
          })
      : undefined,
  };
}
