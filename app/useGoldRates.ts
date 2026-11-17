import { useEffect, useMemo, useState } from 'react';
import { NO_PREMIUM, type Premium } from '../shared/rates';
import type { RateSource } from './source';
import { parseLatest, rateStatus, type RateStatus } from './status';

/** How often the hook re-checks the date, so a warning appears without a new value. */
const RECHECK_MS = 60_000;

const readPremium = (source: RateSource): Premium => source.readPremium?.() ?? NO_PREMIUM;
const samePremium = (a: Premium, b: Premium) => a.gold_pct === b.gold_pct && a.silver_pct === b.silver_pct;

/** True when two statuses show the same thing. `ibja` comes from the same stored text, so it is compared by identity. */
export const sameStatus = (a: RateStatus, b: RateStatus) =>
  a.ibja === b.ibja && a.state === b.state && a.rateDate === b.rateDate && a.stale === b.stale && a.daysBehind === b.daysBehind && samePremium(a.premium, b.premium);

/**
 * Today's rate from Remote Config (cached on the phone, updated live), with its
 * date, whether to show a warning, and the market premium added when the
 * source gives one. Never touches Firestore or the API.
 *
 * The returned object stays the same while nothing it shows changes (the
 * minute re-check, or a Remote Config fetch with the same rate), so screens
 * that read it do not redraw for nothing.
 */
export function useGoldRates(source: RateSource): RateStatus {
  // The stored text, not the parsed object: an unchanged rate is the same string, so nothing downstream changes.
  const [raw, setRaw] = useState<string | null>(() => source.read());
  const [premium, setPremium] = useState<Premium>(() => readPremium(source));
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const reload = () => {
      setRaw(source.read());
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

  const latest = useMemo(() => parseLatest(raw), [raw]);
  const next = useMemo(() => rateStatus(latest, now, premium), [latest, now, premium]);
  const [kept, setKept] = useState(next);
  const same = sameStatus(kept, next);
  if (!same) setKept(next);
  return same ? kept : next;
}
