import { type Firestore } from 'firebase-admin/firestore';
import { type DailyRate, type LatestRate } from '../shared/types';
import type { Premium } from '../shared/rates';
import type { ManualConfig } from './job';
export declare function ensureAdminApp(): void;
/** Firestore Timestamps → ISO strings. */
export declare function fromFirestore<T>(data: Record<string, unknown> | undefined): T | null;
export declare function firestoreStore(db?: Firestore): {
    readConfig: () => Promise<ManualConfig | null>;
    readLatest: () => Promise<LatestRate | null>;
    saveDaily: (row: DailyRate) => Promise<void>;
    saveLatest: (latest: LatestRate) => Promise<void>;
};
/**
 * Writes the latest rate as the JSON parameter `goldrates_latest` and publishes the template.
 * With `premiumDefault`, also creates the two premium parameters when they are missing, so the
 * owner finds them in the console. An existing premium value is never changed: the owner owns it.
 */
export declare function publishToRemoteConfig(latest: LatestRate, premiumDefault?: Premium): Promise<void>;
