"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.OUTDATED_WORKING_DAYS = exports.RUN_HOUR_IST = exports.TIME_ZONE = exports.RETRY_HOURS_IST = exports.SCHEDULE = void 0;
exports.runKind = runKind;
exports.istDate = istDate;
exports.latestScheduledRunDate = latestScheduledRunDate;
exports.workingDaysBetween = workingDaysBetween;
/**
 * Cron for the daily job: 5:00 AM, Monday to Friday, plus 3 retry slots an hour apart (6, 7 and 8 AM). A retry slot
 * calls the API only when that day's 5 AM run failed with a temporary problem (see `runDailyRates`); on a normal day
 * it does nothing.
 */
exports.SCHEDULE = '0 5-8 * * 1-5';
/** IST hours of the retry slots; the last one is the final try of the day. */
exports.RETRY_HOURS_IST = [6, 7, 8];
/** Which run of the day an IST moment is: the 5 AM run, a retry, or the day's final retry. Other hours (a manual "Force run") count as a first run. */
function runKind(now) {
    const hour = new Date(now.getTime() + 5.5 * 60 * 60 * 1000).getUTCHours();
    if (hour === exports.RETRY_HOURS_IST[exports.RETRY_HOURS_IST.length - 1])
        return 'final';
    if (exports.RETRY_HOURS_IST.includes(hour))
        return 'retry';
    return 'first';
}
/** Time zone of {@link SCHEDULE}. */
exports.TIME_ZONE = 'Asia/Kolkata';
/** Hour (IST) the job runs. */
exports.RUN_HOUR_IST = 5;
/** After this many missed working days the app says "Rates may be outdated". */
exports.OUTDATED_WORKING_DAYS = 3;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** India has no daylight saving, so IST is always UTC+5:30. */
function istParts(now) {
    const ist = new Date(now.getTime() + IST_OFFSET_MS);
    return { date: ist.toISOString().slice(0, 10), weekday: ist.getUTCDay(), hour: ist.getUTCHours() };
}
/** The IST calendar date of a moment, `YYYY-MM-DD`. */
function istDate(now) {
    return istParts(now).date;
}
function addDays(date, days) {
    return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}
function weekdayOf(date) {
    return new Date(`${date}T00:00:00Z`).getUTCDay();
}
const isWorkingDay = (weekday) => weekday >= 1 && weekday <= 5;
/**
 * The date of the newest scheduled run at `now`: today if it is a weekday and
 * past 5 AM IST, otherwise the weekday before. Weekends and the hours before
 * 5 AM therefore point at the previous working day and show no warning.
 */
function latestScheduledRunDate(now) {
    const { date, weekday, hour } = istParts(now);
    if (isWorkingDay(weekday) && hour >= exports.RUN_HOUR_IST)
        return date;
    let day = addDays(date, -1);
    while (!isWorkingDay(weekdayOf(day)))
        day = addDays(day, -1);
    return day;
}
/** Working days (Mon–Fri) after `from` up to and including `to`. 0 when `to` ≤ `from`. */
function workingDaysBetween(from, to) {
    let count = 0;
    for (let day = addDays(from, 1); day <= to; day = addDays(day, 1)) {
        if (isWorkingDay(weekdayOf(day)))
            count += 1;
    }
    return count;
}
