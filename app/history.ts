import { RATES_COLLECTION, type DailyRate } from '../shared/types';

/**
 * Reads one Firestore document and returns its data, or null if it does not
 * exist. The app writes this around the SDK it uses, for example:
 *
 *   (collection, id) => getDoc(doc(db, collection, id)).then((s) => s.data() ?? null)
 */
export type ReadDoc = (collection: string, id: string) => Promise<Record<string, unknown> | null>;

const toIso = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  const timestamp = value as { toDate?: () => Date };
  return typeof timestamp.toDate === 'function' ? timestamp.toDate().toISOString() : null;
};

/**
 * The saved rate for a past date (`YYYY-MM-DD`), or null when that day has no
 * row (weekend, holiday, failed run). Use for history only: today's rate comes
 * from {@link useGoldRates}.
 */
export async function getRatesForDate(readDoc: ReadDoc, date: string): Promise<DailyRate | null> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must be YYYY-MM-DD');
  const data = await readDoc(RATES_COLLECTION, date);
  if (!data) return null;
  return { ...(data as unknown as DailyRate), rate_time: toIso(data.rate_time), created_at: toIso(data.created_at) ?? '' };
}
