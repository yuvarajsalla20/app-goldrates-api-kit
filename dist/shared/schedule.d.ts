/** Cron for the daily job: 5:00 AM, Monday to Friday. */
export declare const SCHEDULE = "0 5 * * 1-5";
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
