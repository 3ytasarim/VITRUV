/** Shared browser helpers for the E2E runner (playwright-core + the installed Chromium). */
import { join } from 'node:path';
import { chromium } from 'playwright-core';

export const EMAILS = {
  admin: 'e2e.admin@vitruv.invalid',
  coachA: 'e2e.coach.a@vitruv.invalid',
  coachB: 'e2e.coach.b@vitruv.invalid',
  clientA: 'e2e.anna@vitruv.invalid',
  clientB: 'e2e.ben@vitruv.invalid',
};

export async function launch() {
  return chromium.launch({ headless: true });
}

/** A fresh context (own cookie jar) logged in through the real /login form. */
export async function loggedIn(browser, ctx, who) {
  const context = await browser.newContext({
    baseURL: ctx.site,
    locale: 'de-DE',
    viewport: { width: 1366, height: 900 },
  });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel(/E-Mail/i).fill(EMAILS[who]);
  await page.getByRole('textbox', { name: 'Passwort', exact: true }).fill(ctx.password);
  await page.getByRole('button', { name: /Anmelden/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 30_000 });
  return { context, page };
}

export async function shot(page, ctx, name) {
  await page.screenshot({ path: join(ctx.artifacts, `${name}.png`), fullPage: true });
}
