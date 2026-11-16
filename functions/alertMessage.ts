import type { RateAlert } from './job';

const inr = (value: number) => `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function istTime(iso: string): string {
  const ist = new Date(Date.parse(iso) + 5.5 * 60 * 60 * 1000);
  return `${ist.toISOString().slice(0, 10)} ${ist.toISOString().slice(11, 16)} IST`;
}

/**
 * Subject and plain-text body for the failure / recovery email, whichever way
 * it is sent (Cloud Monitoring alert or the Trigger Email extension).
 */
export function alertMessage(alert: RateAlert): { subject: string; text: string } {
  const showing = alert.showing
    ? `The app is showing: 24K ${inr(alert.showing.gold_24k)}/g, silver 999 ${inr(alert.showing.silver_999)}/g, as of ${alert.showing.rate_date}.`
    : 'The app has no rate to show yet.';
  if (alert.kind === 'recovered') {
    return {
      subject: `✅ Gold rate API working again – ${alert.runDate}`,
      text: [`Run: ${istTime(alert.runAt)}`, 'The daily rate was saved and published.', showing].join('\n'),
    };
  }
  return {
    subject: `⚠️ Gold rate API failed – ${alert.runDate}`,
    text: [
      `Run: ${istTime(alert.runAt)}`,
      `Error: ${alert.error}`,
      `What to do: ${alert.action}`,
      showing,
      '',
      'To set a rate by hand: in Firestore open config/goldrates and set manual_gold_24k and manual_silver_999',
      '(₹ per gram, IBJA 999), plus manual_benchmark (where you took it from). Then run the job again from',
      'Cloud Scheduler ("Force run"). Clear the fields to go back to the API.',
    ].join('\n'),
  };
}
