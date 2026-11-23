/** Development aid: writes aria snapshots of admin pages (as Coach Alpha) to the artifacts dir. */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, loggedIn } from './browser.mjs';

export async function explore(ctx, paths) {
  const browser = await launch();
  try {
    const { page } = await loggedIn(browser, ctx, 'coachA');
    for (const [i, raw] of paths.entries()) {
      const path = raw.replace(/\{(\w+)\}/g, (_, key) => ctx.users[key]);
      await page.goto(path);
      await page.waitForLoadState('networkidle');
      const snap = await page.locator('main').first().ariaSnapshot();
      writeFileSync(
        join(ctx.artifacts, `explore-${i}.yml`),
        `# ${path} → ${page.url()}\n${snap}\n`,
      );
    }
  } finally {
    await browser.close();
  }
}
