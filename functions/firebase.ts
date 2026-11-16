/** Firestore and Remote Config adapters for the job (firebase-admin). */
import { getApps, initializeApp } from 'firebase-admin/app';
import { Timestamp, getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getRemoteConfig } from 'firebase-admin/remote-config';
import {
  CONFIG_COLLECTION,
  CONFIG_DOC,
  LATEST_DOC,
  RATES_COLLECTION,
  REMOTE_CONFIG_KEY,
  type DailyRate,
  type LatestRate,
} from '../shared/types';
import type { ManualConfig } from './job';

export function ensureAdminApp() {
  if (getApps().length === 0) initializeApp();
}

const TIME_FIELDS = ['rate_time', 'created_at', 'last_attempt_at'] as const;

/** ISO strings → Firestore Timestamps, so the console shows real times. */
function toFirestore<T extends object>(row: T): Record<string, unknown> {
  const out = { ...row } as Record<string, unknown>;
  for (const field of TIME_FIELDS) {
    const value = out[field];
    if (typeof value === 'string') out[field] = Timestamp.fromDate(new Date(value));
  }
  return out;
}

/** Firestore Timestamps → ISO strings. */
export function fromFirestore<T>(data: Record<string, unknown> | undefined): T | null {
  if (!data) return null;
  const out: Record<string, unknown> = { ...data };
  for (const field of TIME_FIELDS) {
    const value = out[field] as { toDate?: () => Date } | undefined;
    if (value && typeof value.toDate === 'function') out[field] = value.toDate().toISOString();
  }
  return out as T;
}

export function firestoreStore(db: Firestore = getFirestore()) {
  const rates = db.collection(RATES_COLLECTION);
  return {
    readConfig: async () => fromFirestore<ManualConfig>((await db.collection(CONFIG_COLLECTION).doc(CONFIG_DOC).get()).data()),
    readLatest: async () => fromFirestore<LatestRate>((await rates.doc(LATEST_DOC).get()).data()),
    // set() without merge: a second run on the same day replaces the row, never adds one.
    saveDaily: async (row: DailyRate) => {
      await rates.doc(row.rate_date).set(toFirestore(row));
    },
    saveLatest: async (latest: LatestRate) => {
      await rates.doc(LATEST_DOC).set(toFirestore(latest));
    },
  };
}

/** Writes the latest rate as the JSON parameter `goldrates_latest` and publishes the template. */
export async function publishToRemoteConfig(latest: LatestRate): Promise<void> {
  const rc = getRemoteConfig();
  const template = await rc.getTemplate();
  template.parameters[REMOTE_CONFIG_KEY] = {
    defaultValue: { value: JSON.stringify(latest) },
    valueType: 'JSON',
    description: 'Daily gold and silver rates (app-goldrates-api-kit). Written by the 5 AM job; do not edit by hand.',
  };
  await rc.publishTemplate(template);
}
