/**
 * Cron for the daily job: 5:00 AM, Monday to Friday, plus 3 retry slots an hour apart (6, 7 and 8 AM). A retry slot
 * calls the API only when that day's 5 AM run failed with a temporary problem (see `runDailyRates`); on a normal day
 * it does nothing.
 */
export declare const SCHEDULE = "0 5-8 * * 1-5";
/** IST hours of the retry slots; the last one is the final try of the day. */
export declare const RETRY_HOURS_IST: readonly [6, 7, 8];
/** Which run of the day an IST moment is: the 5 AM run, a retry, or the day's final retry. Other hours (a manual "Force run") count as a first run. */
export declare function runKind(now: Date): 'first' | 'retry' | 'final';
/** Time zone of {@link SCHEDULE}. */
export declare const TIME_ZONE = "Asia/Kolkata";
/** Hour (IST) the job runs. */
export declare const RUN_HOUR_IST = 5;
/** After this many missed working days the app says "Rates may be outdated". */
export declare const OUTDATED_WORKING_DAYS = 3;
/** The IST calendar date of a moment, `YYYY-MM-DD`. */
export declare function istDate(now: Date): string;
/**
 * The date of the newest scheduled run at `now`: today if it is a weekday and
 * past 5 AM IST, otherwise the weekday before. Weekends and the hours before
 * 5 AM therefore point at the previous working day and show no warning.
 */
export declare function latestScheduledRunDate(now: Date): string;
/** Working days (Mon–Fri) after `from` up to and including `to`. 0 when `to` ≤ `from`. */
export declare function workingDaysBetween(from: string, to: string): number;
