import { type Firestore } from 'firebase-admin/firestore';
import { type DailyRate, type LatestRate } from '../shared/types';
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
/** Writes the latest rate as the JSON parameter `goldrates_latest` and publishes the template. */
export declare function publishToRemoteConfig(latest: LatestRate): Promise<void>;
