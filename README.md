# app-goldrates-api-kit

Daily **India gold and silver rates** (IBJA benchmark) for Expo + Firebase apps.
It fetches **once a day at 5:00 AM IST, Monday to Friday**, converts the rates to 24K / 22K / 18K gold and 999 / 925 silver per gram in ₹, stores one row per day, and gives the app a simple way to read the latest rate.

> Status: **v1.1.0** (adds the market premium). Setup steps: [docs/setup.md](docs/setup.md). What is still open: [Open decisions](#open-decisions).

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

Entry points:

| Import | What it holds |
|---|---|
| `app-goldrates-api-kit` | App side: `useGoldRates(source)` (today's rate from Remote Config, with `state`, `rateDate` and `stale`), `rnFirebaseSource(remoteConfig())`, `rateStatus`, `getRatesForDate(readDoc, date)` (history from Firestore), `valueOf(rates, { metal, purity, grams }, { premiumPct? })`, `KIT_NAME`, `KIT_VERSION` |
| `app-goldrates-api-kit/functions` | Cloud side: `goldRatesDaily` (the scheduled function) or `createGoldRatesDaily({ region, onAlert })`, re-exported from the app's `functions/src/index.ts`. Ships as built JavaScript in `dist/`. |

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

Rounded to 2 decimals (half up), so 18K on 14 Nov 2026 is 13,581.02 × 0.75 = 10,185.765 → **10,185.77**.

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
- **How it's sent: decided 16 Nov 2026: (a) Cloud Monitoring.** Setup steps in [docs/setup.md](docs/setup.md#6-the-failure-email). The options were: Owner prefers doing it inside Firebase with no extra email login. Options: (a) Google Cloud Monitoring alert on a `GOLDRATE_API_FAILED` log entry → built-in email notification (no SMTP needed); (b) Firebase "Trigger Email" extension (needs an SMTP login such as a Gmail app password or SendGrid).
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
| `gold_18k` | number (₹/g) | 10185.77 |
| `silver_999` | number (₹/g) | 178.00 |
| `silver_925` | number (₹/g) | 164.65 |
| `usd_inr` | number | 94.19 |
| `source` | string | `METALS.DEV` or `MANUAL` |
| `source_url` | string | `https://api.metals.dev/v1/latest` |
| `benchmark` | string | `IBJA` (or where a manual rate came from, e.g. `GoodReturns`) |
| `rate_time` | timestamp | from `timestamps.metal` (null for manual) |
| `unchanged` | boolean | true when the price equals the previous row (e.g. IBJA holiday) |
| `created_at` | timestamp | when saved |
| `premium_gold_pct` | number (%) | 1.3 (market premium in Remote Config when the job ran) |
| `premium_silver_pct` | number (%) | 1.3 |
| `market_gold_24k` | number (₹/g) | 13757.57 (= `gold_24k` + premium) |
| `market_gold_22k` | number (₹/g) | 12611.57 |
| `market_gold_18k` | number (₹/g) | 10318.19 |
| `market_silver_999` | number (₹/g) | 180.31 |
| `market_silver_925` | number (₹/g) | 166.79 |

`gold_24k` … `silver_925` are always the **real API price** (IBJA). The `premium_*` and `market_*` columns record the % used that day and the resulting price, so every row has the full picture. Rows saved before v1.1.0 don't have them.

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
- Value = grams × rate for the item's purity, with the market premium added (see [Market premium](#market-premium-gold-and-silver-)).

## Market premium (gold and silver %)

Shops quote a little above the IBJA benchmark (about **1.3%** on 14–16 Nov 2026: GoodReturns 24K ₹13,761/g vs IBJA ₹13,581/g). The kit can add a **market premium** on top of IBJA when values are shown. Decided by the owner on 16 Nov 2026:

- **Two settings, one per metal**, in Firebase **Remote Config**. They apply to **every user** of the app:

  | Parameter | Type | Example | Meaning |
  |---|---|---|---|
  | `goldrates_premium_gold_pct` | Number | `1.3` | % added to gold 24K, 22K and 18K |
  | `goldrates_premium_silver_pct` | Number | `1.3` | % added to silver 999 and 925 |

- **Change it any time without a deployment or app update:** Firebase console › Remote Config › edit the value › **Publish changes**. Phones pick it up on their next Remote Config check (open apps within about an hour, or straight away on a pull to refresh).
- `0` = plain IBJA. Allowed range is **0 to 10**. A value that is empty, not a number, below 0 or above 10 is ignored and the app's built-in default is used instead.
- **The database keeps everything.** Each `daily_rates` row keeps the real API price in `gold_24k` … `silver_925`, plus the % in effect that morning (`premium_gold_pct`, `premium_silver_pct`) and the price with it added (`market_gold_24k` … `market_silver_925`). See [Firestore structure](#firestore-structure).
- The app applies the **current** % from Remote Config, so a change shows on phones within about an hour, without waiting for the next 5 AM run. The `market_*` columns record what the % was on each day.
- The premium applies to **every value shown**: today's price, item values, growth, net worth, history charts and reports.
- **The premium is private: the app never shows it.** No screen, report or PDF shows the %, the plain IBJA rate next to the shown rate, or the word "premium". The app shows one rate, e.g. "₹13,758/g · as of 14 Nov", called the market rate, and may say it is *based on* the IBJA benchmark. It must not call the shown number "the IBJA rate", because it isn't.
- Like the rates themselves, the two values reach the phone through Remote Config (that is how the app applies them without a deployment). They are not shown, but someone inspecting the app's network traffic could read them. If that ever matters, the premium can move server side (the job would publish rates with the premium included), at the cost of a re-run of the job after each change.
- The 5 AM job reads the two parameters each morning for the row, and **creates them** with the app's default (`createGoldRatesDaily({ premiumDefault })`) if they don't exist yet, so they appear in the console ready to edit. It never changes them after that.

Example (24K on 14 Nov 2026, 1.3%): 13,581.02 × 1.013 = **13,757.57**; 22K 12,449.72 × 1.013 = **12,611.57**.

In code:

| Import | What it does |
|---|---|
| `RateSource.readPremium()` | The app's source returns `{ gold_pct, silver_pct }`; `premiumFromValues(get, fallback)` reads the two parameters |
| `useGoldRates(source)` / `rateStatus(latest, now, premium)` | `rates` = IBJA + premium (use it for every value and every rate shown), `ibja` = plain IBJA and `premium` = the % used, for calculations only, never shown |
| `applyPremium(rates, premium)` | Same for history rows (`getRatesForDate`, charts) |
| `rnFirebaseSource(rc, { premiumFallback })` | Reads the two parameters for `@react-native-firebase/remote-config` |

A source without `readPremium` behaves exactly like v1.0.0 (plain IBJA).

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
| Market premium range | 0–10% per metal (the values themselves are Remote Config settings, see Market premium) |

---

## Not in this version
- Other providers or countries (later, if needed).
- Historical monthly rates for purchase-price estimates (RBI monthly table). Planned separately.
- A different premium per user (the premium is the same for every user).
- GST: values never include the 3% GST that shops add when you buy.

---

## Build plan

Approved by the owner on 16 Nov 2026. Steps 1–4 and 6–8 are built in v1.0.0; 5 and 9 need a live call with the owner's key.

| Step | What | Done when | Status |
|---|---|---|---|
| 1 | Repo setup: README (this file), licence, folder layout (`functions/`, `app/`, `docs/`), TypeScript, lint | Repo builds cleanly | ✅ Built |
| 2 | Metals.dev client: one call to `/v1/latest?currency=INR&unit=g`, read the 4 fields, map the error codes above | Unit tests pass with saved sample responses (success + each error code) | ✅ Built (sample responses are hand-made from the documented format) |
| 3 | Rate maths: 22K / 18K / 925 conversion, rounding, ±10% sanity check | Tests match the 14 Nov 2026 example values | ✅ Built |
| 4 | Scheduled job: 5:00 AM IST Mon–Fri, manual override check, upsert `daily_rates/{date}` and `latest`, publish `goldrates_latest` to Remote Config, stale flag, alert log | Runs in the Firebase emulator and writes the right documents | ✅ Built; emulator test passes (Remote Config faked) |
| 5 | Check if timeseries returns IBJA; if yes add backfill of missed weekdays (≤30 days per call) | Decision recorded; if built, emulator test fills the gap | ⏳ Not built: needs a live timeseries call |
| 6 | Firestore security rules: users read only, only the function writes | Rules tests pass | ✅ Built; emulator rules tests pass |
| 7 | App side (Expo): read today's rate from Remote Config (real-time update, cached on device), "Rate as of", "Rates may be outdated" after 3 working days, value = grams × rate | Works in the example app | ✅ Built and unit-tested; not yet tried in PAL |
| 8 | Failure email (fail + recovered; sending method to discuss) and setup docs: Blaze plan, `firebase functions:secrets:set METALS_DEV_API_KEY`, deploy, how to set or clear a manual rate | A fresh project can follow them end to end | ✅ Log entries + email text + docs; sending method still open |
| 9 | Live check: one real call with the owner's key, compare with IBJA's published rate | `gold_24k` matches IBJA 999 | ⏳ Needs the owner's key |

Then the kit is wired into PAL.

---

## Open decisions

| Item | Options | Status |
|---|---|---|
| Failure email: how it is sent | Cloud Monitoring alert on the `GOLDRATE_API_FAILED` / `GOLDRATE_API_RECOVERED` log entries, built-in email, no SMTP | **Decided 16 Nov 2026** (steps in [docs/setup.md](docs/setup.md#6-the-failure-email)) |
| Failure email: address | The owner's address, set as `ALERT_EMAIL` | To confirm |
| Rate shown in the app | IBJA + a premium per metal from Remote Config, same for all users, 1.3% to start | **Decided 16 Nov 2026** (see [Market premium](#market-premium-gold-and-silver-)) |
| Metals.dev plan | Free (100 calls/month) or paid ($1.79/month) for commercial use | Free for now; paid before launch if needed |

---

## Kit rules

- **The kit tags itself.** Raise `version` in `package.json` (and `KIT_VERSION`, a test checks they match) inside the pull request and add a CHANGELOG note. Merging creates tag `v<version>` through the `version-tag` workflow, which also refuses a pull request whose version is not higher than the latest tag. Never tag by hand.
- **Expo rules:** the app side imports no Firebase SDK itself. The app passes a small `{ read, subscribe }` source; `rnFirebaseSource` fits `@react-native-firebase/remote-config` (Expo development build). No hand-edited `ios/` or `android/`.
- **`dist/` is committed.** The Cloud Function side must be plain JavaScript inside `node_modules`, so after changing `functions/` or `shared/` run `npm run build` and commit `dist/`. CI fails if it is out of date.
- **Nothing app-specific** in the kit. App names, colours and wording stay in the app.
- **Commit and push only when the owner says so.**

## Folder layout

```
shared/          rate maths, schedule and types used by both sides
functions/       the scheduled job, Metals.dev client, Firestore + Remote Config adapters, alert text
app/             the Expo side: useGoldRates, rateStatus, getRatesForDate, valueOf
dist/            built JavaScript of functions/ + shared/ (committed, see Kit rules)
rules/           Firestore rules snippet
docs/            setup: Blaze plan, secret, deploy, manual rate, email
tests/           vitest unit tests, with sample Metals.dev responses
emulator-tests/  Firestore emulator: rules + the job writing real documents (npm run test:emulator)
```

## License

MIT
