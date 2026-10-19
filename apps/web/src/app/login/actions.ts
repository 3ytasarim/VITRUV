'use server';

import { loginRequestSchema } from '@vitruv/contracts';
import { redirect } from 'next/navigation';
import { safeNextPath, safePortalPath } from '@/lib/auth/cookies';
import { authApi, clientIp, storeSession } from '@/lib/auth/session';

export type LoginState =
  | { status: 'idle' }
  | {
      status: 'error';
      message: string;
      email: string;
      fieldErrors?: Partial<Record<'email' | 'password', string>>;
    };

/** One message for every credential failure — it never says which part was wrong. */
const INVALID = 'Zugangsdaten nicht korrekt. Bitte prüfe E-Mail bzw. Benutzername und Passwort.';

/**
 * One login for the Admin/Coach panel and the client area ("Mein Training"; CLIENT accounts). The API checks the credentials, rate limits and account
 * status; this action only stores the returned token pair in HttpOnly cookies. The password is
 * passed through untouched and never logged or echoed back.
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const rawEmail = String(formData.get('email') ?? '').slice(0, 254);
  const parsed = loginRequestSchema.safeParse({
    email: rawEmail,
    password: formData.get('password') ?? '',
    clientType: 'WEB',
  });
  if (!parsed.success) {
    const fieldErrors: Partial<Record<'email' | 'password', string>> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if ((field === 'email' || field === 'password') && !fieldErrors[field]) {
        fieldErrors[field] = issue.message;
      }
    }
    return {
      status: 'error',
      message: 'Bitte prüfe deine Eingaben.',
      email: rawEmail,
      fieldErrors,
    };
  }

  const api = authApi();
  const result = await api.login(
    { email: parsed.data.email, password: parsed.data.password },
    await clientIp(),
  );
  if (!result.ok) {
    const message =
      result.status === 401
        ? INVALID
        : result.status === 429
          ? 'Zu viele Anmeldeversuche. Bitte warte einige Minuten und versuche es dann erneut.'
          : 'Die Anmeldung ist gerade nicht möglich. Bitte versuche es später erneut.';
    return { status: 'error', message, email: rawEmail };
  }

  const { permissions } = result.data.user;
  if (!permissions.includes('admin.access') && permissions.includes('training.self.read')) {
    // CLIENT: own training area only — never the panel, whatever `next` says.
    await storeSession(result.data.tokens);
    redirect(safePortalPath(formData.get('next')));
  }
  if (!permissions.includes('admin.access')) {
    // Valid account without any web area: end the new session right away.
    await api.logout({ accessToken: result.data.tokens.accessToken });
    return {
      status: 'error',
      message: 'Dieses Konto hat keinen Zugang zum Verwaltungsbereich.',
      email: rawEmail,
    };
  }

  await storeSession(result.data.tokens);
  redirect(safeNextPath(formData.get('next')));
}
