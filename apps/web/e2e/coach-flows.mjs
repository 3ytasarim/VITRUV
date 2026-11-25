/**
 * Sprint 7.5 — coach flows in a real browser (Chromium via playwright-core) against the local
 * stack started by run.mjs. Fictional data only. Steps run in order and share state; a failed
 * step stores a screenshot + aria snapshot in the artifacts dir and later dependent steps fail.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { launch, loggedIn, shot } from './browser.mjs';

const TEMPLATE = 'E2E Oberkörper A';

function berlinToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(new Date());
}

/** Thin JSON client for the real API (used for the participant side and for direct checks). */
function apiClient(ctx) {
  const call = async (method, path, token, body) => {
    const res = await fetch(`${ctx.api}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : {} };
  };
  const login = async (email, clientType = 'MOBILE') => {
    const res = await call('POST', '/v1/auth/login', undefined, {
      email,
      password: ctx.password,
      clientType,
    });
    if (res.status !== 200) throw new Error(`login ${email} → ${res.status}`);
    return res.body.tokens.accessToken;
  };
  return { call, login };
}

export async function runFlows(ctx) {
  const results = [];
  const state = {};
  const browser = await launch();
  const api = apiClient(ctx);
  let page;
  let failedBefore = false;

  const step = async (name, fn, { independent = false } = {}) => {
    const started = Date.now();
    if (failedBefore && !independent) {
      results.push({ name, status: 'skipped', ms: 0, error: 'earlier step failed' });
      return;
    }
    try {
      await fn();
      results.push({ name, status: 'passed', ms: Date.now() - started });
    } catch (error) {
      if (!independent) failedBefore = true;
      const slug = name.replace(/[^a-z0-9]+/gi, '-').slice(0, 60);
      let snapshot = '';
      try {
        if (page) {
          await shot(page, ctx, `FAIL-${slug}`);
          snapshot = await page.locator('body').ariaSnapshot();
        }
      } catch {
        /* page gone */
      }
      writeFileSync(join(ctx.artifacts, `FAIL-${slug}.yml`), `# ${page?.url()}\n${snapshot}`);
      results.push({
        name,
        status: 'failed',
        ms: Date.now() - started,
        error: String(error?.message ?? error).split('\n')[0],
      });
    }
  };
  const expectVisible = async (locator, timeout = 15_000) => {
    await locator.first().waitFor({ state: 'visible', timeout });
  };

  try {
    await step('1. coach logs in through the real login form', async () => {
      ({ page } = await loggedIn(browser, ctx, 'coachA'));
      if (!new URL(page.url()).pathname.startsWith('/admin'))
        throw new Error(`landed on ${page.url()}`);
    });

    await step('2. workout library opens (empty state)', async () => {
      await page.goto('/admin/training/workouts');
      await expectVisible(page.getByRole('heading', { name: 'Workout-Bibliothek' }));
      await expectVisible(page.getByText('Noch keine Workouts'));
    });

    await step('3. create a template: validation, exercise, sets/reps, save', async () => {
      await page.getByRole('link', { name: 'Neues Workout' }).first().click();
      await expectVisible(page.getByRole('heading', { name: 'Neues Workout' }));
      // validation: saving without a name is refused
      await page.getByRole('button', { name: 'Speichern' }).click();
      await expectVisible(page.getByRole('alert').or(page.locator('[aria-invalid="true"]')));
      await page.getByRole('textbox', { name: 'Name' }).fill(TEMPLATE);
      await page.getByRole('combobox', { name: 'Typ' }).selectOption({ label: 'Oberkörper' });
      const main = page
        .getByRole('listitem')
        .filter({ has: page.getByRole('heading', { name: /^Hauptteil/ }) });
      await main.getByRole('button', { name: 'Übung hinzufügen' }).click();
      await page.getByRole('searchbox').last().fill('E2E Knie');
      await page.getByRole('button', { name: /E2E Kniebeuge/ }).click();
      await main.getByLabel('Sätze').fill('3');
      await main.getByLabel('Wdh.').fill('10');
      await page.getByRole('button', { name: 'Speichern' }).click();
      await page.waitForURL(/\/admin\/training\/workouts(\/[0-9a-f-]{36})?(\?.*)?$/, {
        timeout: 30_000,
      });
      await shot(page, ctx, '03-template-saved');
    });

    await step('3b. template appears in the library', async () => {
      await page.goto('/admin/training/workouts');
      await expectVisible(page.getByText(TEMPLATE));
      state.templateUrl = await page
        .getByRole('link', { name: TEMPLATE, exact: true })
        .getAttribute('href');
    });

    await step('4. duplicate the template — the original stays unchanged', async () => {
      await page.getByRole('button', { name: `${TEMPLATE} duplizieren` }).click();
      await expectVisible(page.getByRole('heading', { name: `${TEMPLATE} (Kopie)` }));
      await expectVisible(
        page.getByRole('status').filter({ hasText: 'das Original bleibt unverändert' }),
      );
      state.copyUrl = new URL(page.url()).pathname;
      await page.goto('/admin/training/workouts');
      await expectVisible(page.getByText('2 Workouts'));
      // original still has exactly its one exercise and version 1
      const original = page
        .getByRole('listitem')
        .filter({ has: page.getByRole('link', { name: TEMPLATE, exact: true }) });
      await expectVisible(original.getByText(/1 Übung · Version 1/));
      writeFileSync(
        join(ctx.artifacts, 'library-2.yml'),
        await page.locator('main').ariaSnapshot(),
      );
    });

    await step('5. assign the template to client A and client B (independent copies)', async () => {
      await page.getByRole('button', { name: `${TEMPLATE} Teilnehmer zuweisen` }).click();
      const dialog = page.getByRole('dialog');
      await expectVisible(dialog);
      await dialog.getByRole('checkbox', { name: /Anna Beispiel/ }).check();
      await dialog.getByRole('checkbox', { name: /Ben Muster/ }).check();
      await expectVisible(dialog.getByText('2 ausgewählt'));
      await dialog.getByLabel('Datum').fill(berlinToday());
      await dialog
        .getByRole('button', { name: /zuweisen/i })
        .last()
        .click();
      await expectVisible(dialog.getByText(/zugewiesen|Kopie angelegt|erledigt/i), 30_000);
      await shot(page, ctx, '05-assigned');
      const links = dialog.getByRole('link', { name: 'Für Teilnehmer bearbeiten' });
      const rowOf = (name) => dialog.getByRole('listitem').filter({ hasText: name });
      state.editA = await rowOf('Anna Beispiel').getByRole('link').getAttribute('href');
      state.editB = await rowOf('Ben Muster').getByRole('link').getAttribute('href');
      if (
        (await links.count()) !== 2 ||
        !state.editA ||
        !state.editB ||
        state.editA === state.editB
      ) {
        throw new Error('expected two separate per-client copies');
      }
      await dialog.getByRole('button', { name: 'Schließen' }).click();
    });

    const setsValue = async (path) => {
      await page.goto(path);
      const input = page.getByLabel('Sätze').first();
      await input.waitFor({ state: 'visible', timeout: 15_000 });
      return input.inputValue();
    };

    await step(
      '6. edit client A’s copy (3 → 5 sets) — B’s copy and the template stay 3',
      async () => {
        if ((await setsValue(state.editA)) !== '3')
          throw new Error('A copy did not start with 3 sets');
        await page.getByLabel('Sätze').first().fill('5');
        await page
          .getByRole('button', { name: /^(Speichern|Änderungen speichern)$/ })
          .first()
          .click();
        await expectVisible(page.getByText(/gespeichert/i), 20_000);
        await shot(page, ctx, '06-copy-a-saved');
        const a = await setsValue(state.editA);
        const b = await setsValue(state.editB);
        const template = await setsValue(state.templateUrl);
        if (a !== '5' || b !== '3' || template !== '3') {
          throw new Error(`isolation broken: A=${a} B=${b} template=${template}`);
        }
      },
    );

    await step(
      '7. Trainingswoche: the workout is on today; a second workout on the same day',
      async () => {
        await page.goto(`/admin/kunden/${ctx.users.clientA}/training`);
        const today = page
          .getByRole('listitem')
          .filter({ has: page.getByRole('heading', { name: /\(heute\)/ }) });
        await expectVisible(today.getByText(TEMPLATE));
        await today.getByRole('button', { name: /^Workout hinzufügen/ }).click();
        const picker = page.getByRole('dialog', { name: 'Aus Bibliothek wählen' });
        await picker.getByRole('button', { name: /\(Kopie\)/ }).click();
        const assign = page.getByRole('dialog', { name: 'Teilnehmer zuweisen' });
        await expectVisible(assign.getByText('Anna Beispiel'));
        await assign.getByRole('button', { name: 'Zuweisen' }).click();
        await expectVisible(assign.getByText(/zugewiesen für/), 30_000);
        await assign.getByRole('button', { name: 'Schließen' }).click();
        await page.goto(`/admin/kunden/${ctx.users.clientA}/training`);
        await expectVisible(today.getByText(`${TEMPLATE} (Kopie)`));
        await expectVisible(today.getByText(TEMPLATE, { exact: true }));
        await shot(page, ctx, '07-two-workouts-same-day');
        const items = today.getByRole('list').getByRole('listitem');
        const edit = (item) =>
          item.getByRole('link', { name: 'Workout bearbeiten' }).getAttribute('href');
        state.dayMain = (await edit(items.filter({ hasNotText: '(Kopie)' }))).split('/').pop();
        state.dayCopy = (await edit(items.filter({ hasText: '(Kopie)' }))).split('/').pop();
        if (state.dayMain === state.dayCopy) throw new Error('same-day workouts share one id');
      },
    );

    await step('8. activate the draft plan (visible for the participant afterwards)', async () => {
      await page.getByRole('link', { name: 'Plan öffnen und aktivieren' }).click();
      await page.getByRole('button', { name: 'Plan aktivieren' }).click();
      const confirm = page.getByRole('dialog').getByRole('button', { name: /aktivieren/i });
      await confirm.last().waitFor({ state: 'visible', timeout: 10_000 });
      await confirm.last().click();
      // the server action must finish before navigating away
      await expectVisible(page.getByText(/^Plan aktiviert/));
      await page.goto(`/admin/kunden/${ctx.users.clientA}/training`);
      await expectVisible(
        page.getByText(/Plan „Trainingsplan“ · Woche 1|Plan „Trainingsplan“ \(Aktiv\)/),
      );
      if (await page.getByText('noch nicht sichtbar').count())
        throw new Error('plan still a draft');
    });

    await step(
      '9. participant (real API) completes both same-day workouts separately',
      async () => {
        const token = await api.login('e2e.anna@vitruv.invalid');
        const play = async (dayId, reps) => {
          const started = await api.call('POST', '/v1/client/workouts', token, {
            trainingDayId: dayId,
          });
          if (started.status !== 201) throw new Error(`start → ${started.status}`);
          const session = started.body.session;
          const exercise = session.exercises[0];
          if (exercise.sets.length !== reps.length) {
            throw new Error(`snapshot has ${exercise.sets.length} sets, expected ${reps.length}`);
          }
          for (const [i, actualReps] of reps.entries()) {
            const res = await api.call(
              'PATCH',
              `/v1/client/workouts/${session.id}/exercises/${exercise.id}/sets/${i + 1}`,
              token,
              {
                completed: true,
                actualReps,
              },
            );
            if (res.status !== 200) throw new Error(`set ${i + 1} → ${res.status}`);
          }
          const done = await api.call('POST', `/v1/client/workouts/${session.id}/complete`, token);
          if (done.status !== 200) throw new Error(`complete → ${done.status}`);
          return session.id;
        };
        // client A's copy was edited to 5 sets (step 6) — the session snapshots exactly that
        state.sessionMain = await play(state.dayMain, [10, 10, 9, 8, 8]);
        state.sessionCopy = await play(state.dayCopy, [10, 10, 10]);
        const history = await api.call('GET', '/v1/client/workouts', token);
        const ids = history.body.items.map((item) => item.id);
        if (
          !ids.includes(state.sessionMain) ||
          !ids.includes(state.sessionCopy) ||
          state.sessionMain === state.sessionCopy
        ) {
          throw new Error('same-day sessions not listed separately');
        }
        state.clientToken = token;
      },
    );

    await step(
      '10. coach refresh shows the new results (progress, history, detail, comparison)',
      async () => {
        await page.goto(`/admin/kunden/${ctx.users.clientA}/training`);
        const progress = page.getByRole('region', { name: 'Trainingsfortschritt' });
        await expectVisible(progress);
        const erledigt = await progress.getByRole('definition').nth(1).innerText();
        if (erledigt.trim() !== '2') throw new Error(`Erledigt = ${erledigt}`);
        await shot(page, ctx, '10-coach-progress');
        await page.goto(`/admin/kunden/${ctx.users.clientA}/training/einheit/${state.sessionMain}`);
        await expectVisible(page.getByText(/Satz 1: 10 von 10 Wdh\./));
        await expectVisible(page.getByText(/Satz 5: 8 von 10 Wdh\./));
        await expectVisible(page.getByText(/Gesamt: 45 Wiederholungen/));
        // first workout of this exercise → honest "no comparison", never a fake 0
        await expectVisible(page.getByText(/Noch keine Vergleichsdaten/));
        await shot(page, ctx, '10-session-detail');
      },
    );

    await step('11. dashboard refresh lists the participant activity', async () => {
      await page.goto('/admin');
      await expectVisible(page.getByRole('heading', { level: 1 }));
      const latest = page.getByRole('region', { name: 'Letzte Einheiten' });
      await expectVisible(latest.getByText(/Anna Beispiel/));
      await expectVisible(page.getByRole('link', { name: /Einheiten diese Woche 2/ }));
      await shot(page, ctx, '11-dashboard');
    });

    await step(
      '12. an unassigned coach can open neither the client nor the session',
      async () => {
        const other = await loggedIn(browser, ctx, 'coachB');
        try {
          for (const path of [
            `/admin/kunden/${ctx.users.clientA}/training`,
            `/admin/kunden/${ctx.users.clientA}/training/einheit/${state.sessionMain}`,
            `${state.editA}`,
          ]) {
            const res = await other.page.goto(path);
            const body = await other.page.locator('body').innerText();
            if (res.status() !== 404 || body.includes('Anna Beispiel')) {
              throw new Error(`${path} → ${res.status()} for an unassigned coach`);
            }
          }
          await shot(other.page, ctx, '12-unassigned-coach-404');
          const token = await api.login('e2e.coach.b@vitruv.invalid', 'WEB');
          const direct = await api.call(
            'GET',
            `/v1/admin/training/clients/${ctx.users.clientA}/workouts`,
            token,
          );
          if (direct.status !== 404) throw new Error(`API → ${direct.status}`);
        } finally {
          await other.context.close();
        }
      },
      { independent: true },
    );

    await step(
      '13. archive and restore a template; assigned copies and history stay',
      async () => {
        await page.goto('/admin/training/workouts');
        await page.getByRole('button', { name: `${TEMPLATE} (Kopie) archivieren` }).click();
        const confirm = page.getByRole('dialog').getByRole('button', { name: /archivieren/i });
        await confirm.last().waitFor({ state: 'visible', timeout: 10_000 });
        await confirm.last().click();
        await expectVisible(page.getByText('1 Workout'));
        await page.getByRole('combobox', { name: 'Status' }).selectOption({ label: 'Archiviert' });
        await page.getByRole('button', { name: 'Suchen' }).click();
        await expectVisible(page.getByRole('link', { name: `${TEMPLATE} (Kopie)`, exact: true }));
        // an archived template can not be assigned or edited — restore it from its page
        await page.goto(state.copyUrl);
        await expectVisible(page.getByText('Archiviert – nicht zuweisbar'));
        await page.getByRole('button', { name: 'Wiederherstellen' }).click();
        await expectVisible(
          page.getByRole('button', { name: `${TEMPLATE} (Kopie) Teilnehmer zuweisen` }),
        );
        await page.goto('/admin/training/workouts');
        await expectVisible(page.getByText('2 Workouts'));
        await page.goto(`/admin/kunden/${ctx.users.clientA}/training/einheit/${state.sessionCopy}`);
        await expectVisible(page.getByText(/Satz 3: 10 von 10 Wdh\./));
      },
      { independent: true },
    );

    await step(
      '14. concurrent template edit → 409 message, reload keeps the newer version',
      async () => {
        const second = await page.context().newPage();
        try {
          await page.goto(state.templateUrl);
          await second.goto(state.templateUrl);
          await page.getByRole('textbox', { name: 'Name' }).fill(`${TEMPLATE} v2`);
          await page.getByRole('button', { name: 'Speichern' }).click();
          await expectVisible(page.getByText(/Vorlage gespeichert \(Version 2\)/), 20_000);
          await second.getByRole('textbox', { name: 'Name' }).fill(`${TEMPLATE} parallel`);
          await second.getByRole('button', { name: 'Speichern' }).click();
          await expectVisible(second.getByRole('button', { name: 'Neu laden' }), 20_000);
          await shot(second, ctx, '14-conflict');
          await second.getByRole('button', { name: 'Neu laden' }).click();
          await second.waitForLoadState('networkidle');
          const name = await second.getByRole('textbox', { name: 'Name' }).inputValue();
          if (name !== `${TEMPLATE} v2`) throw new Error(`after reload: ${name}`);
        } finally {
          await second.close();
        }
      },
      { independent: true },
    );

    await step(
      '15. network failure in the exercise search shows an error; retry works (+ loading)',
      async () => {
        await page.goto(state.templateUrl);
        const main = page
          .getByRole('listitem')
          .filter({ has: page.getByRole('heading', { name: /^Hauptteil/ }) });
        // server actions are POSTs with a Next-Action header: delay once (loading), then fail
        let mode = 'delay';
        await page.route('**/*', async (route) => {
          const req = route.request();
          if (req.method() === 'POST' && req.headers()['next-action']) {
            if (mode === 'delay') {
              await new Promise((r) => setTimeout(r, 1500));
              return route.continue();
            }
            if (mode === 'fail') return route.abort('internetdisconnected');
          }
          return route.continue();
        });
        await main.getByRole('button', { name: 'Übung hinzufügen' }).click();
        const search = page.getByRole('searchbox').last();
        await search.fill('E2E L');
        await expectVisible(page.getByText('Suche …'));
        await expectVisible(page.getByRole('button', { name: /E2E Liegestütz/ }));
        mode = 'fail';
        await search.fill('E2E P');
        await expectVisible(page.getByText(/Keine Verbindung zum Server/));
        // no stale result of the previous query next to the error
        if (await page.getByRole('button', { name: /E2E Liegestütz/ }).count()) {
          throw new Error('stale result shown next to the error');
        }
        await shot(page, ctx, '15-network-error');
        mode = 'ok';
        await page.getByRole('button', { name: 'Erneut versuchen' }).click();
        await expectVisible(page.getByRole('button', { name: /E2E Plank/ }));
        await page.unroute('**/*');
      },
      { independent: true },
    );

    await step(
      '16. history pagination: 25 sessions, "Ältere Einheiten" without duplicates',
      async () => {
        // A dated workout can be completed once (409 WORKOUT_ALREADY_COMPLETED otherwise), so the
        // coach assigns 23 more (real admin API) — plus one idempotency check on the way.
        const coach = await api.login('e2e.coach.a@vitruv.invalid', 'WEB');
        const templateId = state.templateUrl.split('/').pop();
        const assign = (requestId) =>
          api.call('POST', `/v1/admin/training/templates/${templateId}/assign`, coach, {
            clientId: ctx.users.clientA,
            requestId,
            date: berlinToday(),
          });
        const first = await assign('00000000-0000-4000-8000-00000000e2e0');
        const again = await assign('00000000-0000-4000-8000-00000000e2e0');
        if (
          first.status >= 300 ||
          again.body.created !== false ||
          again.body.dayId !== first.body.dayId
        ) {
          throw new Error(
            `assign idempotency: ${first.status}/${again.status} created=${again.body.created}`,
          );
        }
        const days = [first.body.dayId];
        for (let i = 1; i < 23; i++) {
          const res = await assign(
            `00000000-0000-4000-8000-${String(0xe2e0 + i).padStart(12, '0')}`,
          );
          if (res.status >= 300) throw new Error(`assign ${i} → ${res.status}`);
          days.push(res.body.dayId);
        }
        for (const [i, dayId] of days.entries()) {
          const started = await api.call('POST', '/v1/client/workouts', state.clientToken, {
            trainingDayId: dayId,
          });
          if (started.status !== 201) throw new Error(`start ${i} → ${started.status}`);
          const done = await api.call(
            'POST',
            `/v1/client/workouts/${started.body.session.id}/complete`,
            state.clientToken,
          );
          if (done.status !== 200) throw new Error(`complete ${i} → ${done.status}`);
        }
        await page.goto(`/admin/kunden/${ctx.users.clientA}/training`);
        const history = page.getByRole('region', { name: 'Trainingsverlauf' });
        const links = async () =>
          history
            .getByRole('link')
            .evaluateAll((els) =>
              els
                .map((el) => el.getAttribute('href'))
                .filter((href) => href?.includes('/einheit/')),
            );
        const page1 = await links();
        await history.getByRole('link', { name: 'Ältere Einheiten' }).click();
        await page.waitForURL(/verlauf=/);
        const page2 = await links();
        const overlap = page1.filter((href) => page2.includes(href));
        if (page1.length === 0 || page2.length === 0 || overlap.length) {
          throw new Error(`pages ${page1.length}/${page2.length}, overlap ${overlap.length}`);
        }
        if (page1.length + page2.length !== 25) {
          throw new Error(`total ${page1.length + page2.length}`);
        }
        await shot(page, ctx, '16-history-page-2');
      },
      { independent: true },
    );

    await step(
      `17. feature flag TRAINING_EXTENDED_TYPES=${ctx.extendedTypes} is reflected in the editor`,
      async () => {
        await page.goto('/admin/training/workouts/neu');
        const main = page
          .getByRole('listitem')
          .filter({ has: page.getByRole('heading', { name: /^Hauptteil/ }) });
        await main.getByRole('button', { name: 'Übung hinzufügen' }).click();
        await page.getByRole('searchbox').last().fill('E2E Knie');
        await page.getByRole('button', { name: /E2E Kniebeuge/ }).click();
        const core = main.getByRole('combobox', { name: 'Art' }).locator('option', {
          hasText: 'Core-Intervall',
        });
        const disabled = await core.evaluate((option) => option.disabled);
        const note = await page.getByText(/noch nicht freigegeben, bis alle/).count();
        if (ctx.extendedTypes === 'enabled' ? disabled || note : !disabled || !note) {
          throw new Error(`flag ${ctx.extendedTypes}: core disabled=${disabled}, note=${note}`);
        }
        await shot(page, ctx, `17-flag-${ctx.extendedTypes}`);
      },
      { independent: true },
    );

    // Sprint 8A: private training media (upload, protected playback, Range, access rules).
    const { mediaFlows } = await import('./media-flows.mjs');
    await mediaFlows({ ctx, browser, api, step });
  } finally {
    await browser.close();
  }
  return results;
}
