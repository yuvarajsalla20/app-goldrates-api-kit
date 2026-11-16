import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';

/** The kit's snippet wrapped in a full rules file, as an app would paste it. */
const snippet = readFileSync(new URL('../rules/goldrates.rules', import.meta.url), 'utf8');
const rules = `rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n${snippet}\n  }\n}\n`;

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-goldrates-rules', firestore: { rules } });
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'daily_rates/2026-11-16'), { gold_24k: 13581.02 });
    await setDoc(doc(ctx.firestore(), 'daily_rates/latest'), { gold_24k: 13581.02 });
    await setDoc(doc(ctx.firestore(), 'config/goldrates'), { manual_gold_24k: null });
  });
});

afterAll(async () => {
  await env?.cleanup();
});

describe('Firestore rules', () => {
  it('signed-in users can read daily rates and latest', async () => {
    const db = env.authenticatedContext('user-1').firestore();
    await assertSucceeds(getDoc(doc(db, 'daily_rates/2026-11-16')));
    await assertSucceeds(getDoc(doc(db, 'daily_rates/latest')));
  });
  it('signed-out users cannot read', async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'daily_rates/latest')));
  });
  it('nobody but the function can write rates', async () => {
    const db = env.authenticatedContext('user-1').firestore();
    await assertFails(setDoc(doc(db, 'daily_rates/2026-11-17'), { gold_24k: 1 }));
    await assertFails(setDoc(doc(db, 'daily_rates/latest'), { gold_24k: 1 }));
  });
  it('users cannot read or change the manual override', async () => {
    const db = env.authenticatedContext('user-1').firestore();
    await assertFails(getDoc(doc(db, 'config/goldrates')));
    await assertFails(setDoc(doc(db, 'config/goldrates'), { manual_gold_24k: 1 }));
  });
});
