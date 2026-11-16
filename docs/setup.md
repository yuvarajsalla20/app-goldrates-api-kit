# Setting up app-goldrates-api-kit in an app

Commands are for Windows PowerShell, one line each, run from the app repo.

## 1. Before you start

- The Firebase project is on the **Blaze** plan (scheduled functions need it).
- Firestore and Remote Config are turned on.
- The app's Firebase CLI is signed in: `firebase login`

## 2. The secret

Save the Metals.dev key in Secret Manager. The CLI asks for the value, so it never lands in your shell history:

```powershell
firebase functions:secrets:set METALS_DEV_API_KEY --project personal-assests-locker
```

Check it is there (prints the value, so only on your own screen):

```powershell
firebase functions:secrets:access METALS_DEV_API_KEY --project personal-assests-locker
```

Never put the key in app code, Remote Config, Firestore, git or chat.

## 3. The Cloud Function

If the app has no `functions/` folder yet: `firebase init functions` (TypeScript, Node 22).

Add the kit to `functions/package.json`, pinned by the full SHA of the release tag (find it with `git ls-remote https://github.com/yuvarajsalla20/app-goldrates-api-kit refs/tags/v1.0.0`):

```jsonc
"dependencies": {
  "app-goldrates-api-kit": "git+https://github.com/yuvarajsalla20/app-goldrates-api-kit.git#<full SHA of v1.0.0>",
  "firebase-admin": "^14.5.1",
  "firebase-functions": "^7.4.0"
}
```

In `functions/src/index.ts`:

```ts
export { goldRatesDaily } from 'app-goldrates-api-kit/functions';
```

Or, to choose the region or send the email yourself:

```ts
import { createGoldRatesDaily } from 'app-goldrates-api-kit/functions';
export const goldRatesDaily = createGoldRatesDaily({ region: 'asia-south1', onAlert: async (alert, message) => { /* send message.subject / message.text */ } });
```

Deploy:

```powershell
cd functions; npm install; cd ..; firebase deploy --only functions --project personal-assests-locker
```

That creates a Cloud Scheduler job `firebase-schedule-goldRatesDaily-asia-south1` that runs at 5:00 AM IST, Monday to Friday. No retries.

**Run it by hand** (to test, or after setting a manual rate): Google Cloud console › Cloud Scheduler › the job › **Force run**. A second run on the same day replaces that day's row. Every run uses one Metals.dev call (100 a month on the free plan).

## 4. Firestore rules

Paste the two `match` blocks from [`rules/goldrates.rules`](../rules/goldrates.rules) into the app's `firestore.rules`, then:

```powershell
firebase deploy --only firestore:rules --project personal-assests-locker
```

Signed-in users can read `daily_rates`. Nobody can write it except the function. `config/goldrates` is admin only.

## 5. Manual rate

When the API is down or wrong, set a rate by hand in the Firebase console › Firestore › `config/goldrates` (create the document if it is missing):

| Field | Type | Example |
|---|---|---|
| `manual_gold_24k` | number | `13600` (₹ per gram, 999 / 24K) |
| `manual_silver_999` | number | `179` |
| `manual_usd_inr` | number or null | `94.2` (null keeps the last one) |
| `manual_benchmark` | string | `GoodReturns` |

Both gold and silver must be set; half a manual rate is treated as a failure. Then **Force run** the job (section 3). The ±10% sanity check applies to manual rates too, so a typo is caught.

To go back to the API, set the fields to `null` (or delete the document).

## 6. The failure email

Every failed run writes an `ERROR` log entry `GOLDRATE_API_FAILED`, and the first good run after it writes `GOLDRATE_API_RECOVERED`. Both carry the email `subject` and `text`.

The email is sent by a **Cloud Monitoring log-based alert** (decided 16 Nov 2026). No email login is needed. Set it up once:

1. Google Cloud console (project `personal-assests-locker`) › **Monitoring › Alerting › Edit notification channels** › **Email** › add your address.
2. **Logging › Logs Explorer**, run this query:
   `resource.type="cloud_run_revision" AND jsonPayload.message="GOLDRATE_API_FAILED"`
3. **Actions › Create log alert**. Name it `Gold rate API failed`. In the documentation box write: "The daily gold rate job failed. Open the log entry for the error, what to do and the rate the app shows."
4. Notification frequency: **once per day** (one run a day anyway). Incident autoclose: 1 day. Choose your email channel. Save.
5. Repeat steps 2–4 with `GOLDRATE_API_RECOVERED` and the name `Gold rate API working again` for the recovery email.

The email links to the log entry, which holds the full `subject` and `text` (error code, what to do, the rate the app is showing, how to set a manual rate).

Another sender is still possible later through `onAlert` (section 3), for example the Trigger Email extension, without changing the kit.

## 7. The app (Expo)

Today's rate comes only from Remote Config; Firestore is read only for past dates.

```ts
import remoteConfig from '@react-native-firebase/remote-config';
import { rnFirebaseSource, useGoldRates, valueOf } from 'app-goldrates-api-kit';

// Create once, outside components.
const ratesSource = rnFirebaseSource(remoteConfig());

function Rate() {
  const { state, rates, rateDate } = useGoldRates(ratesSource);
  if (state === 'none') return <Text>Rate not available</Text>;
  // state 'behind' → warning, 'outdated' → "Rates may be outdated"
  return <Text>₹{rates!.gold_24k}/g · as of {rateDate}</Text>;
}
```

`@react-native-firebase/remote-config` needs an Expo development build (config plugin, no hand-edited `ios/`). If the app uses another Remote Config library, pass your own `{ read, subscribe }` instead of `rnFirebaseSource`. Call `fetchAndActivate()` once at start-up as usual; the hook re-reads on real-time updates.

History for a past date:

```ts
import { getRatesForDate } from 'app-goldrates-api-kit';
const row = await getRatesForDate((c, id) => getDoc(doc(db, c, id)).then((s) => s.data() ?? null), '2026-11-14');
```

## 8. First-week checks

- Compare `daily_rates/{date}.gold_24k` with IBJA's published 999 rate on ibja.co for a few days.
- Confirm Metals.dev holds the previous working day's closing rate at 5 AM.
