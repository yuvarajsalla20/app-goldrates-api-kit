# Changelog

Release notes for app-goldrates-api-kit, newest first. Each version is tagged in git (`v1.0.0`).

## 1.0.0

First release.

- Cloud side (`app-goldrates-api-kit/functions`): `goldRatesDaily`, a scheduled Cloud Function at 5:00 AM IST Monday to Friday with no retries. One Metals.dev call (`ibja_gold`, `ibja_silver`, `USD`), or the manual rate from `config/goldrates` when set. ±10% sanity check, purity conversion (22K 0.9167, 18K 0.75, 925 0.925), upsert of `daily_rates/{date}` and `daily_rates/latest`, publish to the Remote Config parameter `goldrates_latest`. On failure: keeps the previous rate with its own date, marks it stale, still publishes it, and writes a `GOLDRATE_API_FAILED` log entry (plus `GOLDRATE_API_RECOVERED` on the next good run) with the email subject and body. Optional `onAlert` hook for sending the email another way.
- App side (`app-goldrates-api-kit`): `useGoldRates(source)` (Remote Config, cached and live, never Firestore), `rateStatus` with `current` / `behind` / `outdated` / `none`, `getRatesForDate` for history, `valueOf` with an optional premium, `rnFirebaseSource` for `@react-native-firebase/remote-config`.
- Firestore rules snippet in `rules/goldrates.rules`, with emulator tests.
