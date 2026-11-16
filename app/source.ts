import { REMOTE_CONFIG_KEY } from '../shared/types';

/**
 * Where the app reads today's rate. The kit does not pick a Firebase SDK: the
 * app passes two small functions around the Remote Config it already uses.
 */
export interface RateSource {
  /** The current `goldrates_latest` string (cached on the phone), or null. */
  read: () => string | null;
  /**
   * Calls `onChange` when a new value is active (Remote Config real-time
   * updates). Returns a function that stops listening. Optional.
   */
  subscribe?: (onChange: () => void) => () => void;
}

/** The parts of `@react-native-firebase/remote-config` the kit uses. */
export interface RnFirebaseRemoteConfigLike {
  getValue(key: string): { asString(): string };
  activate(): Promise<boolean>;
  onConfigUpdated?(listener: (event?: unknown, error?: unknown) => void): () => void;
}

/**
 * Ready-made source for `@react-native-firebase/remote-config`
 * (needs an Expo development build).
 *
 *   import remoteConfig from '@react-native-firebase/remote-config';
 *   const source = rnFirebaseSource(remoteConfig());
 */
export function rnFirebaseSource(rc: RnFirebaseRemoteConfigLike, key: string = REMOTE_CONFIG_KEY): RateSource {
  return {
    read: () => rc.getValue(key).asString() || null,
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
