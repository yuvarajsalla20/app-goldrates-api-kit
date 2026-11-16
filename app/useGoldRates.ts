import { useEffect, useMemo, useState } from 'react';
import type { LatestRate } from '../shared/types';
import type { RateSource } from './source';
import { parseLatest, rateStatus, type RateStatus } from './status';

/** How often the hook re-checks the date, so a warning appears without a new value. */
const RECHECK_MS = 60_000;

/**
 * Today's rate from Remote Config (cached on the phone, updated live), with its
 * date and whether to show a warning. Never touches Firestore or the API.
 */
export function useGoldRates(source: RateSource): RateStatus {
  const [latest, setLatest] = useState<LatestRate | null>(() => parseLatest(source.read()));
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    setLatest(parseLatest(source.read()));
    const stop = source.subscribe?.(() => setLatest(parseLatest(source.read())));
    const timer = setInterval(() => setNow(new Date()), RECHECK_MS);
    return () => {
      stop?.();
      clearInterval(timer);
    };
  }, [source]);

  return useMemo(() => rateStatus(latest, now), [latest, now]);
}
