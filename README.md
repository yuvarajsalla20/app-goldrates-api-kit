# app-goldrates-api-kit

Daily **India gold and silver rates** (IBJA benchmark) for Expo + Firebase apps.
It fetches **once a day at 5:00 AM IST, Monday to Friday**, converts the rates to 24K / 22K / 18K gold and 999 / 925 silver per gram in ₹, stores one row per day, and gives the app a simple way to read the latest rate.

> Status: **design only, not built yet.** See [Build plan](#build-plan).

Part of the shared kits:
[app-core-kit](https://github.com/yuvarajsalla20/app-core-kit) ·
[app-auth-kit](https://github.com/yuvarajsalla20/app-auth-kit) ·
[app-account-kit](https://github.com/yuvarajsalla20/app-account-kit) ·
[app-settings-kit](https://github.com/yuvarajsalla20/app-settings-kit) ·
[app-subscriptions-kit](https://github.com/yuvarajsalla20/app-subscriptions-kit) ·
[app-payments-kit](https://github.com/yuvarajsalla20/app-payments-kit) ·
[app-export-kit](https://github.com/yuvarajsalla20/app-export-kit) ·
[app-guard-kit](https://github.com/yuvarajsalla20/app-guard-kit) ·
**app-goldrates-api-kit**

First used by **PAL – Personal Asset Locker**.

---

## Install (once released)

The kit has two parts: the **Cloud Function** (deployed to the app's Firebase project) and the **app side** (imported in the Expo app). Like every kit, it is pinned by the full commit SHA of a release tag, with the tag written in `kitVersions`:

```jsonc
// package.json of the app
"dependencies": {
  "app-goldrates-api-kit": "git+https://github.com/yuvarajsalla20/app-goldrates-api-kit.git#<full SHA of v1.0.0>"
},
"kitVersions": {
  "app-goldrates-api-kit": "v1.0.0"
}
```

Find a SHA with `git ls-remote https://github.com/yuvarajsalla20/app-goldrates-api-kit refs/tags/v1.0.0`. Use `git+https`, never `git+ssh`.

Planned entry points (*names to confirm when building*):

| Import | What it holds |
|---|---|
| `app-goldrates-api-kit` | App side: `useGoldRates()` (today's rate from Remote Config, with `rateDate` and `stale`), `getRatesForDate(date)` (history from Firestore), `valueOf({ metal, purity, grams })`, `KIT_NAME`, `KIT_VERSION` |
| `app-goldrates-api-kit/functions` | Cloud side: `goldRatesDaily` (the scheduled function), re-exported from the app's `functions/index.ts` |

---

## Input

There is only one input:

| Input | Where it lives | Example |
|---|---|---|
| `METALS_DEV_API_KEY` | Firebase Secret Manager | `firebase functions:secrets:set METALS_DEV_API_KEY` |

For the failure email you also set `ALERT_EMAIL` once. How the email is sent is still to be discussed (see Failure email).

Everything else is built into the kit (see [Fixed settings](#fixed-settings)).

**Never** put the key in the app code, Firebase Remote Config, Firestore, git or chat.

---

## Data source

- Provider: **Metals.dev** (https://metals.dev)
- Endpoint: `GET https://api.metals.dev/v1/latest?api_key=<KEY>&currency=INR&unit=g`
- One call returns everything we need. We keep only these fields:

| Saved as | Response field | Example (14 Nov 2026) |
|---|---|---|
| `gold_24k` | `metals.ibja_gold` | 13,581.02 |
| `silver_999` | `metals.ibja_silver` | 178.00 |
| `usd_inr` | `currencies.USD` | 94.19 |
| `rate_time` | `timestamps.metal` | 2026-11-16T02:20:11Z |

Do **not** use `metals.gold` / `metals.silver`. Those are world spot prices, about 15% below Indian rates.

Plan: the free plan gives 100 calls a month, and the kit uses about 22 (one per weekday). Metals.dev's terms link commercial use to an active paid subscription, so move to the paid plan ($1.79/month) if needed. Only the key changes.

---

## Purity conversion

| Saved as | Formula | Standard |
|---|---|---|
| `gold_22k` | `gold_24k × 0.9167` | 22/24 karat, BIS hallmark 22K916 |
| `gold_18k` | `gold_24k × 0.75` | 18/24 karat, BIS hallmark 18K750 |
| `silver_925` | `silver_999 × 0.925` | Sterling, BIS silver grade |

Rounded to 2 decimals.

---

## Daily job (Cloud Function)

**Yes, it is a scheduled job.** The kit ships it as a **Firebase scheduled Cloud Function** (Cloud Scheduler runs it):
- Schedule: `0 5 * * 1-5` with time zone `Asia/Kolkata` (5:00 AM IST, Mon–Fri).
- Deploy once with `firebase deploy --only functions`. After that it runs by itself, with no server to manage.
- Needs the Firebase **Blaze (pay-as-you-go)** plan. Cost at this volume is about ₹0: Cloud Scheduler gives 3 free jobs per account, and 22 runs a month is far inside the Functions free tier.


- Runs **once a day at 5:00 AM IST, Monday to Friday**. **No calls on Saturday or Sunday.** No retries: exactly one call per day.
- At 5 AM the API returns the previous working day's IBJA closing rate. `rate_date` is the date the job ran (the day this rate is shown), and `rate_time` keeps the API's own timestamp.
- Steps:
  1. If a **manual rate** is set in `config/goldrates`, use it (`source = MANUAL`).
  2. Otherwise call Metals.dev.
  3. Check the numbers: not zero, and within **10%** of the last saved rate.
  4. Convert purities and **upsert** today's row (a manual re-run on the same day updates the row and never adds a second).
  5. Update `latest`.
- **If the API fails, the job never fails and never returns an error to the app.** Instead it:
  1. keeps the **previous date's rate** as `latest` (with its original `rate_date`),
  2. sets `stale: true`, `last_error` (e.g. `"1203: quota exceeded"`) and `last_attempt_at`,
  3. still publishes that rate to Remote Config, so the app always has a rate and its date,
  4. **sends a failure email** (see [Failure email](#failure-email-important)). There's no retry. The next morning's run (or a manual rate) fixes it, and `stale` goes back to `false`.
- Backfill of missed weekdays: **only if** a test confirms the timeseries endpoint returns IBJA prices (its docs only show spot gold/silver). Otherwise a missed day simply has no row.

### Error handling

Every Metals.dev response has `status` (`success` / `failure`). A failure also has `error_code` and `error_message`.

| Code | Meaning | Kit action |
|---|---|---|
| 1101 | API key invalid | No retry. Alert. Keep the last rate. |
| 1201 | Plan not active (failed payment) | No retry. Alert. Keep the last rate. |
| 1202 | Account not active / disabled | No retry. Alert. Keep the last rate. |
| 1203 | Monthly quota (incl. grace) exceeded | Stop until next month. Alert. Use the last or manual rate. |
| 2101 | Unsupported metal / authority / unit code | No retry. Alert (kit bug). |
| 2102 | Mandatory parameter missing | No retry. Alert (kit bug). |
| 2103 | Unsupported currency | No retry. Alert (kit bug). |
| 2104 | Invalid date format (`YYYY-MM-DD`) | No retry. Alert (kit bug). |
| 2105 | Date range invalid or too long | Split the backfill into ≤30-day chunks. |
| network / timeout / 5xx | Temporary | No retry. Keep the last rate; the next day's run tries again. |

---

## Failure email (IMPORTANT)

**Whenever the API call fails, the job sends an email.**

- **To:** the address in config `ALERT_EMAIL` (the owner's own address, set in the Firebase project; it is never written in this repo). *To confirm with the owner.*
- **When:** every failed run: any error code, network error/timeout, or a failed sanity check (zero or more than a 10% jump). At most one email per day, because there's one run per day.
- **Subject:** `⚠️ Gold rate API failed – <date>`
- **Body:**
  - date and time of the run (IST)
  - error code and message (e.g. `1203: quota exceeded`)
  - what to do (e.g. 1101 → check the key, 1201 → check billing, 1203 → wait for next month or upgrade)
  - the rate the app is showing now and its date
  - how to set a manual rate in `config/goldrates`
- **Recovery:** when the next run succeeds after a failure, send `✅ Gold rate API working again – <date>`.
- **How it's sent: 📝 TO DISCUSS with the owner.** Owner prefers doing it inside Firebase with no extra email login. Options: (a) Google Cloud Monitoring alert on a `GOLDRATE_API_FAILED` log entry → built-in email notification (no SMTP needed); (b) Firebase "Trigger Email" extension (needs an SMTP login such as a Gmail app password or SendGrid).
- If the email itself fails to send, it's logged in Cloud Functions logs, and the rate logic is not affected.

---

## Things to know about the Metals.dev API

1. **Licence:** their terms allow commercial display only with an active paid subscription. We start on free; move to paid ($1.79/month) if needed.
2. **Quota:** 100 calls a month on free, and **test calls count too**. Over the limit → error 1203 until next month.
3. **Always pass `currency=INR&unit=g`.** The default is USD per troy ounce.
4. **No IBJA date in the response.** `timestamps.metal` is when Metals.dev fetched it, not which day's IBJA rate it is. On IBJA holidays the value just repeats. The kit sets `rate_date` to the run date and flags `unchanged: true` if the value equals the previous row.
5. **When Metals.dev refreshes IBJA** isn't documented. At 5 AM we assume it holds the previous working day's closing rate. Confirm in the first week by comparing with ibja.co.
6. **History:** `timeseries` is max 30 days per call and its docs only show spot prices, so IBJA history may not be available. Old purchase-date rates come from the RBI table instead.
7. **The key is in the URL.** Never log the full request URL.
8. **No uptime promise (SLA) on the free plan.** It's a small provider, so the manual rate override is our safety net.
9. **We ignore** `gold`, `silver` (world spot), `mcx_*`, `lbma_*` and the other metals.

---

## Firestore structure

### `daily_rates/{YYYY-MM-DD}`: one document per weekday

| Field | Type | Example |
|---|---|---|
| `rate_date` | string (doc id) | `2026-11-14` |
| `gold_24k` | number (₹/g) | 13581.02 |
| `gold_22k` | number (₹/g) | 12449.72 |
| `gold_18k` | number (₹/g) | 10185.76 |
| `silver_999` | number (₹/g) | 178.00 |
| `silver_925` | number (₹/g) | 164.65 |
| `usd_inr` | number | 94.19 |
| `source` | string | `METALS.DEV` or `MANUAL` |
| `source_url` | string | `https://api.metals.dev/v1/latest` |
| `benchmark` | string | `IBJA` (or where a manual rate came from, e.g. `GoodReturns`) |
| `rate_time` | timestamp | from `timestamps.metal` |
| `created_at` | timestamp | when saved |

### `daily_rates/latest`
A copy of the newest row plus `stale`, `last_error` and `last_attempt_at`. The app does not read it for today's rate (that comes through Remote Config, below); it is the source the job publishes from.

### `config/goldrates`: manual override
| Field | Default | Meaning |
|---|---|---|
| `manual_gold_24k` | `null` | If set, used instead of the API |
| `manual_silver_999` | `null` | If set, used instead of the API |
| `manual_usd_inr` | `null` | If set, used instead of the API |
| `manual_benchmark` | `null` | Where you took the manual rate from |

Empty or `null` means use the API. Clear the fields to go back to the API.

### Security rules
- Signed-in users can **read** `daily_rates`.
- Only the Cloud Function (admin) **writes**. Users can never write.

---

## App side (Expo)

- **Rule: the API is called only by the 5 AM job, and the result is saved in the DB. Everything else (app screens, reports, value calculations) gets rates from the DB, never from the API.**
- The app reads `daily_rates/latest` for today's rate and `daily_rates/{date}` for past days.
- **No DB call for today's rate: the job pushes it to the phones through Firebase Remote Config.**
  - After saving to the DB, the 5 AM job also writes today's rates into **Remote Config** (one parameter `goldrates_latest` holding the same JSON as `daily_rates/latest`).
  - The app uses Remote Config's **real-time updates**: when the job publishes, phones that are open get the new value straight away, and others get it on next launch.
  - Remote Config keeps the value cached on the phone, so screens read it instantly and offline. The old value is simply replaced when the job runs.
  - Remote Config fetches are free and are **not** Firestore reads, so there are **zero DB reads** for today's rate.
  - Firestore (`daily_rates`) stays as the permanent history and source of truth. The app reads it only for past dates (e.g. charts), which is rare.
  - Rates are public data, so they are safe in Remote Config. The API key is **never** put there.
- **The rate is always shown with its date**, e.g. "₹13,581/g · as of 14 Nov".
- **If the rate is not from the latest scheduled run, show a warning**, e.g. ⚠️ "Today's rate isn't available yet. Showing rate from 14 Nov." The latest scheduled run is today at 5 AM IST on a weekday, or Friday on weekends, so normal weekends and the time before 5 AM don't show a warning.
- The app never shows an error or an empty value for the rate. If there's no rate at all (first install, offline), it shows "Rate not available" and hides values.
- Value = grams × rate for the item's purity.

---

## Fixed settings

These are set inside the kit (not inputs):

| Setting | Value |
|---|---|
| Provider | Metals.dev `/v1/latest` |
| Currency / unit | INR / gram |
| Run days and time | Mon–Fri, 5:00 AM IST, once a day |
| Retries | None |
| Sanity limit | ±10% vs last rate |
| Warning shown | When the rate is not from the latest scheduled run (see App side) |
| "Rates may be outdated" | After 3 working days without a new rate |
| Purity factors | 22K 0.9167, 18K 0.75, 925 0.925 |

---

## Not in this version
- Other providers or countries (later, if needed).
- Historical monthly rates for purchase-price estimates (RBI monthly table). Planned separately.
- A shop "premium" to match jeweller rates. The display choice is still open: IBJA is about 1.3% below shop rates.

---

## Build plan

Starts only after the owner says **"yes, build it"**. The empty repo `yuvarajsalla20/app-goldrates-api-kit` exists.

| Step | What | Done when |
|---|---|---|
| 1 | Repo setup: README (this file), licence, folder layout (`functions/`, `app/`, `docs/`), TypeScript, lint | Repo builds cleanly |
| 2 | Metals.dev client: one call to `/v1/latest?currency=INR&unit=g`, read the 4 fields, map the error codes above | Unit tests pass with saved sample responses (success + each error code) |
| 3 | Rate maths: 22K / 18K / 925 conversion, rounding, ±10% sanity check | Tests match the 14 Nov 2026 example values |
| 4 | Scheduled job: 5:00 AM IST Mon–Fri, manual override check, upsert `daily_rates/{date}` and `latest`, publish `goldrates_latest` to Remote Config, stale flag, alert log | Runs in the Firebase emulator and writes the right documents |
| 5 | Check if timeseries returns IBJA; if yes add backfill of missed weekdays (≤30 days per call) | Decision recorded; if built, emulator test fills the gap |
| 6 | Firestore security rules: users read only, only the function writes | Rules tests pass |
| 7 | App side (Expo): read today's rate from Remote Config (real-time update, cached on device), "Rate as of", "Rates may be outdated" after 3 working days, value = grams × rate | Works in the example app |
| 8 | Failure email (fail + recovered; sending method to discuss) and setup docs: Blaze plan, `firebase functions:secrets:set METALS_DEV_API_KEY`, deploy, how to set or clear a manual rate | A fresh project can follow them end to end |
| 9 | Live check: one real call with the owner's key, compare with IBJA's published rate | `gold_24k` matches IBJA 999 |

Then the kit is wired into PAL.

---

## Open decisions

| Item | Options | Status |
|---|---|---|
| Failure email: how it is sent | (a) Cloud Monitoring alert on a `GOLDRATE_API_FAILED` log entry, built-in email, no SMTP (recommended); (b) Firebase "Trigger Email" extension with an SMTP login | To discuss |
| Failure email: address | The owner's address, set as `ALERT_EMAIL` | To confirm |
| Rate shown in the app | IBJA labelled as IBJA (recommended) / a market rate typed by hand daily / IBJA + an adjustable premium | To decide. IBJA is about 1.3% below shop rates |
| Metals.dev plan | Free (100 calls/month) or paid ($1.79/month) for commercial use | Free for now; paid before launch if needed |

---

## Kit rules

- **The kit tags itself.** Raise `version` in `package.json` (and `KIT_VERSION`, a test checks they match) inside the pull request and add a CHANGELOG note. Merging creates tag `v<version>` through the `version-tag` workflow, which also refuses a pull request whose version is not higher than the latest tag. Never tag by hand.
- **Expo rules:** the app side uses only Expo-friendly packages (`@react-native-firebase/remote-config` or the Firebase JS SDK, *to confirm*); no hand-edited `ios/` or `android/`.
- **Nothing app-specific** in the kit. App names, colours and wording stay in the app.
- **Commit and push only when the owner says so.**

## Planned folder layout

```
functions/   the scheduled job, Metals.dev client, rate maths, Remote Config publish, alert log
app/         the Expo side: useGoldRates, getRatesForDate, valueOf
docs/        setup: Blaze plan, secret, deploy, manual rate
tests/       vitest, with saved Metals.dev sample responses
```

## License

MIT
