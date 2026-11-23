/**
 * Sprint 7.5 — browser E2E database (ISOLATED local PostgreSQL only, never Neon).
 *
 *   VITRUV_IT_DATABASE_URL=postgresql://vitruv_it@127.0.0.1:55433/vitruv_it_admin?sslmode=disable \
 *   E2E_PASSWORD=<random, set by the runner> tsx scripts/e2e-seed.ts
 *
 * Fail-closed: the URL is checked statically (loopback, sslmode=disable, vitruv_it_*, not equal to
 * DATABASE_URL) and the server dynamically (cluster name `vitruv-it`) before anything is dropped.
 * Recreates `vitruv_it_e2e`, applies ALL migrations (0000–0025) and writes fictional users only.
 * Prints the E2E database URL (loopback, no password) and the user ids as JSON — never the password.
 */
import {
  createDatabase,
  migrateIsolated,
  recreateIsolatedDatabase,
  schema,
  verifiedIsolatedBase,
} from '@vitruv/db';
import { hashPassword } from '../src/modules/auth/password';

const password = process.env.E2E_PASSWORD ?? '';
if (password.length < 16) throw new Error('E2E_PASSWORD (>= 16 characters) is required');
if (process.env.DATABASE_URL || process.env.DATABASE_URL_DIRECT) {
  throw new Error('Refusing to run: DATABASE_URL must not be set for the E2E seed');
}

const base = await verifiedIsolatedBase();
const url = await recreateIsolatedDatabase(base, 'vitruv_it_e2e');
const applied = await migrateIsolated(url);

const handle = createDatabase(url);
const db = handle.db;
try {
  const hash = await hashPassword(password);
  const user = async (email: string, role: 'ADMIN' | 'COACH' | 'CLIENT') => {
    const [row] = await db
      .insert(schema.users)
      .values({ email, role, status: 'ACTIVE', passwordHash: hash })
      .returning({ id: schema.users.id });
    if (!row) throw new Error('insert failed');
    return row.id;
  };
  const admin = await user('e2e.admin@vitruv.invalid', 'ADMIN');
  const coachA = await user('e2e.coach.a@vitruv.invalid', 'COACH');
  const coachB = await user('e2e.coach.b@vitruv.invalid', 'COACH');
  await db.insert(schema.coachProfiles).values([
    { userId: coachA, displayName: 'Coach Alpha' },
    { userId: coachB, displayName: 'Coach Beta' },
  ]);
  const clientA = await user('e2e.anna@vitruv.invalid', 'CLIENT');
  const clientB = await user('e2e.ben@vitruv.invalid', 'CLIENT');
  await db.insert(schema.clientProfiles).values([
    { userId: clientA, firstName: 'Anna', lastName: 'Beispiel' },
    { userId: clientB, firstName: 'Ben', lastName: 'Muster' },
  ]);
  // Coach Alpha has both clients; Coach Beta has none (unauthorized-coach scenario).
  await db.insert(schema.coachClientAssignments).values([
    { coachUserId: coachA, clientUserId: clientA, assignedByUserId: admin },
    { coachUserId: coachA, clientUserId: clientB, assignedByUserId: admin },
  ]);
  await db.insert(schema.exercises).values([
    { name: 'E2E Kniebeuge', code: 'E2E-01' },
    { name: 'E2E Liegestütz', code: 'E2E-02' },
    { name: 'E2E Plank', code: 'E2E-03' },
  ]);
  process.stdout.write(
    `${JSON.stringify({ url, applied, users: { admin, coachA, coachB, clientA, clientB } })}\n`,
  );
} finally {
  await handle.close();
}
