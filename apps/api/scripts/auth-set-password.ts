/**
 * Operator password reset for an existing account — the stand-in for e-mail based reset until a
 * mail provider exists (docs/AUTH-ARCHITECTURE.md → Password reset). Revokes all sessions of the
 * user.
 *
 *   pnpm --filter @vitruv/api auth:set-password -- --email=user@example.com
 *
 * Password via hidden prompt (or AUTH_NEW_PASSWORD, unset afterwards). Never printed.
 */
import { createDatabase } from '@vitruv/db';
import { AccountTaskError, setUserPassword } from '../src/modules/auth/accounts';
import { argValue, readNewPassword } from './cli-input';

async function main(): Promise<void> {
  const email = argValue('email');
  if (!email) throw new AccountTaskError('Pass --email=<address>.');
  if (!process.env.DATABASE_URL) throw new AccountTaskError('DATABASE_URL is not set.');
  const password = await readNewPassword('AUTH_NEW_PASSWORD');
  const handle = createDatabase(process.env.DATABASE_URL, { maxConnections: 1 });
  try {
    const result = await setUserPassword(handle.db, { email, password });
    console.warn(
      `Password updated (user ${result.userId}); ${result.revokedSessions} session(s) revoked.`,
    );
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
