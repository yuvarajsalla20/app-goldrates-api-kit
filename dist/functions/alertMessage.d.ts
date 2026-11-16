import type { RateAlert } from './job';
/**
 * Subject and plain-text body for the failure / recovery email, whichever way
 * it is sent (Cloud Monitoring alert or the Trigger Email extension).
 */
export declare function alertMessage(alert: RateAlert): {
    subject: string;
    text: string;
};
