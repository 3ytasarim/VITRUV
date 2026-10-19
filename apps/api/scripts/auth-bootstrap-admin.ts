/**
 * One-time creation of the FIRST real ADMIN account (docs/AUTH-ARCHITECTURE.md → Bootstrap).
 *
 *   pnpm --filter @vitruv/api auth:bootstrap-admin -- --email=owner@example.com
 *
 * The password is typed twice at a hidden prompt (or, non-interactively, read from
 * BOOTSTRAP_ADMIN_PASSWORD — unset it afterwards). It is never printed or logged and never
 * accepted as a command-line argument. Refuses if an ADMIN with a password already exists or the
 * e-mail is taken. Not reachable through HTTP.
 */
import { createDatabase } from '@vitruv/db';
import { AccountTaskError, bootstrapAdmin } from '../src/modules/auth/accounts';
import { argValue, readNewPassword } from './cli-input';

async function main(): Promise<void> {
  const email = argValue('email') ?? process.env.BOOTSTRAP_ADMIN_EMAIL;
  if (!email) throw new AccountTaskError('Pass --email=<address> (or BOOTSTRAP_ADMIN_EMAIL).');
  if (!process.env.DATABASE_URL) throw new AccountTaskError('DATABASE_URL is not set.');
  const password = await readNewPassword('BOOTSTRAP_ADMIN_PASSWORD');
  const handle = createDatabase(process.env.DATABASE_URL, { maxConnections: 1 });
  try {
    const { userId } = await bootstrapAdmin(handle.db, {
      email,
      password,
      displayName: argValue('name'),
    });
    console.warn(`ADMIN created (id ${userId}). Sign in at /login.`);
  } finally {
    await handle.close();
  }
}

main().catch((error: unknown) => {
  const e = error as Error;
  console.error(
    e.name === 'AccountTaskError' || e.name === 'Error' ? e.message : `Failed: ${e.name}`,
  );
  process.exit(1);
});
