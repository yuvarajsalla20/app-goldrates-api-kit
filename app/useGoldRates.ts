import { useEffect, useMemo, useState } from 'react';
import { NO_PREMIUM, type Premium } from '../shared/rates';
import type { LatestRate } from '../shared/types';
import type { RateSource } from './source';
import { parseLatest, rateStatus, type RateStatus } from './status';

/** How often the hook re-checks the date, so a warning appears without a new value. */
const RECHECK_MS = 60_000;

const readPremium = (source: RateSource): Premium => source.readPremium?.() ?? NO_PREMIUM;
const samePremium = (a: Premium, b: Premium) => a.gold_pct === b.gold_pct && a.silver_pct === b.silver_pct;

/**
 * Today's rate from Remote Config (cached on the phone, updated live), with its
 * date, whether to show a warning, and the market premium added when the
 * source gives one. Never touches Firestore or the API.
 */
export function useGoldRates(source: RateSource): RateStatus {
  const [latest, setLatest] = useState<LatestRate | null>(() => parseLatest(source.read()));
  const [premium, setPremium] = useState<Premium>(() => readPremium(source));
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const reload = () => {
      setLatest(parseLatest(source.read()));
      const next = readPremium(source);
      setPremium((current) => (samePremium(current, next) ? current : next));
    };
    reload();
    const stop = source.subscribe?.(reload);
    const timer = setInterval(() => setNow(new Date()), RECHECK_MS);
    return () => {
      stop?.();
      clearInterval(timer);
    };
  }, [source]);

  return useMemo(() => rateStatus(latest, now, premium), [latest, now, premium]);
}
